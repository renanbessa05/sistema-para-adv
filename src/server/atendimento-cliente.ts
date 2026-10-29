import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ErroIa, redigirRespostaCliente, rotearMensagemCliente, type ClienteIa } from "@/lib/ia";
import {
  codigoDaMensagem,
  comIdentificacao,
  dataBr,
  decidirEnvio,
  dentroDaJanela24h,
  ehOptOut,
  LIMITE_CLIENTE_MENSAGENS_HORA,
  montarEnvioRespostaEscritorio,
  situacaoHorario,
  TEXTOS_FIXOS,
  textoForaDoHorario,
  type ClienteWhatsapp,
  type MensagemRecebida,
  type RegraHorario,
} from "@/lib/whatsapp";
import { carregarContexto, enfileirarEvento } from "./notificacoes";
import { clienteWhatsappDoEscritorio } from "./integracoes";
import { executarAgente } from "./ia/executar";

/**
 * Atendimento ao cliente pelo WhatsApp (lote 14; docs/regras/atendimento-cliente.md).
 *
 * Regras que este módulo garante:
 * - Respostas automáticas começam pela identificação de assistente de IA e só saem no horário configurado.
 * - Leitura de andamento sai só por template fixo, sem conteúdo de processo; processo sigiloso vira aviso genérico.
 * - Resposta livre da IA é gravada como rascunho (aprovação "mensagem_cliente") e não sai sem aprovação humana.
 * - Tudo passa por decidirEnvio (lib/whatsapp/atendimento.ts): envio desligado, sem verificação, sem opt-in
 *   ou com opt-out bloqueia o envio. Bloqueado vira linha em mensagens com status "falhou" e o motivo.
 * - O envio real é feito pelo job enviarMensagensCliente a partir da fila "mensagens_cliente".
 */

export type IdentificacaoCliente =
  | { tipo: "nenhum" }
  | { tipo: "ambiguo" }
  | { tipo: "nao_verificado"; escritorioId: string; clienteId: string }
  | { tipo: "verificado"; escritorioId: string; clienteId: string };

type Intent = "saudacao" | "andamento_processo" | "falar_com_advogado" | "outro" | "fora_do_escopo";

export interface DepsAtendimento {
  whatsappDe: (escritorioId: string) => Promise<ClienteWhatsapp | null>;
  ia: ClienteIa | null;
  agora: Date;
}

/** Quem é o telefone que escreveu. Número de cliente em mais de um cliente ou escritório é ambíguo (sem resposta). */
export async function identificarCliente(admin: SupabaseClient, telefone: string): Promise<IdentificacaoCliente> {
  const { data } = await admin.from("clientes_contatos").select("escritorio_id, cliente_id, verificado_em").eq("telefone_e164", telefone).eq("ativo", true);
  const linhas = (data ?? []) as { escritorio_id: string; cliente_id: string; verificado_em: string | null }[];
  if (linhas.length === 0) return { tipo: "nenhum" };
  const distintos = new Set(linhas.map((l) => `${l.escritorio_id}:${l.cliente_id}`));
  if (distintos.size > 1) return { tipo: "ambiguo" };
  const escolhida = linhas.find((l) => l.verificado_em) ?? linhas[0];
  return { tipo: escolhida.verificado_em ? "verificado" : "nao_verificado", escritorioId: escolhida.escritorio_id, clienteId: escolhida.cliente_id };
}

/** Atende uma mensagem de cliente identificado. Devolve o texto registrado para a resposta (ou null quando silencia). */
export async function atenderCliente(admin: SupabaseClient, m: MensagemRecebida, ident: Extract<IdentificacaoCliente, { escritorioId: string }>, deps: DepsAtendimento): Promise<string | null> {
  const telefone = m.telefone_e164;
  const { escritorioId, clienteId } = ident;
  const [{ data: esc }, { data: regra }, { data: cliente }] = await Promise.all([
    admin.from("escritorios").select("nome, timezone").eq("id", escritorioId).single(),
    admin.from("regras_atendimento").select("envio_ativo, horario_inicio, horario_fim, dias_semana").eq("escritorio_id", escritorioId).maybeSingle(),
    admin.from("clientes").select("nome").eq("id", clienteId).maybeSingle(),
  ]);
  const nomeEscritorio = String(esc?.nome ?? "");
  const timeZone = String(esc?.timezone ?? "America/Cuiaba");
  const envioAtivo = regra?.envio_ativo === true;
  const horario: RegraHorario = {
    horarioInicio: (regra?.horario_inicio as string | null) ?? null,
    horarioFim: (regra?.horario_fim as string | null) ?? null,
    diasSemana: (regra?.dias_semana as number[] | null) ?? null,
  };
  const nomeCliente = String(cliente?.nome ?? "cliente");

  const whatsapp = await deps.whatsappDe(escritorioId);
  const conversaId = await garantirConversa(admin, escritorioId, clienteId, telefone, m.timestamp);
  await admin.from("mensagens").insert({ escritorio_id: escritorioId, conversa_id: conversaId, direcao: "entrada", id_externo: m.wamid, tipo: m.tipo, texto: m.texto, payload: m.payload_bruto, status_entrega: "entregue" });
  if (whatsapp) await whatsapp.marcarComoLida(m.wamid);

  // Consentimento é lido de novo a cada envio: a verificação e o opt-out podem ocorrer nesta mesma mensagem.
  const enviarAutomatica = async (corpo: string, intent: string, sigiloso = false): Promise<string> => {
    const texto = comIdentificacao(nomeEscritorio, corpo);
    const decisao = await decidirParaCliente(admin, { envioAtivo, escritorioId, clienteId, telefone, sigiloso, origem: "automatica" });
    const { data: msg } = await admin
      .from("mensagens")
      .insert({ escritorio_id: escritorioId, conversa_id: conversaId, direcao: "saida", tipo: "texto", texto, intent, status_entrega: decisao.enviar ? "enfileirada" : "falhou", erro: decisao.enviar ? null : decisao.motivo })
      .select("id")
      .single();
    if (decisao.enviar && msg) await admin.rpc("fila_enfileirar", { p_fila: "mensagens_cliente", p_escritorio: escritorioId, p_payload: { mensagem_id: msg.id }, p_atraso_segundos: 0 });
    return texto;
  };
  const encaminharAdvogado = async (): Promise<string> => {
    await registrarPedidoContato(admin, { escritorioId, clienteId, nomeCliente, conversaId, agora: deps.agora });
    return enviarAutomatica(TEXTOS_FIXOS.encaminhadoAdvogado, "falar_com_advogado");
  };

  const texto = (m.texto ?? "").trim();
  // Descadastro vale antes de tudo: registra o opt-out e não responde.
  if (ehOptOut(texto)) {
    await admin.from("clientes_contatos").update({ opt_out_em: deps.agora.toISOString() }).eq("escritorio_id", escritorioId).eq("cliente_id", clienteId).eq("telefone_e164", telefone).eq("ativo", true);
    return null;
  }
  const { count } = await admin.from("mensagens").select("id", { count: "exact", head: true }).eq("conversa_id", conversaId).eq("direcao", "entrada").gte("criado_em", new Date(deps.agora.getTime() - 3_600_000).toISOString());
  if ((count ?? 0) > LIMITE_CLIENTE_MENSAGENS_HORA) return null;

  if (ident.tipo === "nao_verificado") {
    const codigo = codigoDaMensagem(texto);
    if (!codigo) return enviarAutomatica(TEXTOS_FIXOS.naoVerificado, "nao_verificado");
    const { data: verificados } = await admin.rpc("verificar_contato_cliente", { p_telefone: telefone, p_codigo: codigo });
    return enviarAutomatica(Array.isArray(verificados) && verificados.length > 0 ? TEXTOS_FIXOS.codigoRecebido : TEXTOS_FIXOS.codigoInvalido, "verificacao_contato");
  }

  if (situacaoHorario(horario, deps.agora, timeZone) !== "dentro") {
    return enviarAutomatica(textoForaDoHorario({ inicio: horario.horarioInicio, fim: horario.horarioFim }), "fora_do_horario");
  }

  if (!texto) return enviarAutomatica(TEXTOS_FIXOS.somenteTexto, "somente_texto");

  const intent = await classificar(admin, texto, { escritorioId, conversaId, ia: deps.ia });
  switch (intent) {
    case "saudacao":
      return enviarAutomatica(TEXTOS_FIXOS.saudacao, "saudacao");
    case "andamento_processo": {
      const resposta = await andamentoFixo(admin, escritorioId, clienteId);
      return enviarAutomatica(resposta.texto, "andamento_processo", resposta.sigiloso);
    }
    case "falar_com_advogado":
      return encaminharAdvogado();
    case "fora_do_escopo":
      return enviarAutomatica(TEXTOS_FIXOS.foraDoEscopo, "fora_do_escopo");
    case "outro": {
      if (!deps.ia) return encaminharAdvogado();
      let execucao;
      try {
        execucao = await executarAgente(
          { admin, escritorioId, agente: "resposta_cliente", objeto: { tipo: "mensagem", id: null }, conversaId, cliente: deps.ia },
          (ia, modelo) => redigirRespostaCliente(texto, { cliente: ia, modelo, nomeEscritorio }),
        );
      } catch (e) {
        if (e instanceof ErroIa) return encaminharAdvogado();
        throw e;
      }
      // Rascunho: não sai. A aprovação humana (aprovacoes, objeto mensagem_cliente) decide o envio.
      await admin.rpc("criar_rascunho_cliente", {
        p_escritorio: escritorioId,
        p_conversa: conversaId,
        p_texto: comIdentificacao(nomeEscritorio, execucao.resultado.dados.texto),
        p_ia_execucao_id: execucao.execucaoId,
        p_snapshot: { intent: "outro", cliente_id: clienteId, depende_de_advogado: execucao.resultado.dados.depende_de_advogado },
      });
      if (execucao.resultado.dados.depende_de_advogado) await registrarPedidoContato(admin, { escritorioId, clienteId, nomeCliente, conversaId, agora: deps.agora });
      return enviarAutomatica(TEXTOS_FIXOS.recebido, "recebido_rascunho");
    }
  }
}

/** Decide, pelo consentimento atual no banco, se uma mensagem ao cliente pode sair. */
async function decidirParaCliente(
  admin: SupabaseClient,
  e: { envioAtivo: boolean; escritorioId: string; clienteId: string; telefone: string; sigiloso: boolean; origem: "automatica" | "aprovada" },
) {
  const { data: contato } = await admin.from("clientes_contatos").select("verificado_em, opt_in_em, opt_out_em").eq("escritorio_id", e.escritorioId).eq("cliente_id", e.clienteId).eq("telefone_e164", e.telefone).eq("ativo", true).maybeSingle();
  return decidirEnvio({
    envioAtivo: e.envioAtivo,
    verificado: Boolean(contato?.verificado_em),
    optIn: Boolean(contato?.opt_in_em),
    optOut: Boolean(contato?.opt_out_em),
    processoSigiloso: e.sigiloso,
    origem: e.origem,
  });
}

async function garantirConversa(admin: SupabaseClient, escritorioId: string, clienteId: string, telefone: string, timestamp: string): Promise<string> {
  const { data: existente } = await admin.from("conversas").select("id").eq("escritorio_id", escritorioId).eq("canal", "whatsapp").eq("telefone_e164", telefone).maybeSingle();
  if (existente) {
    await admin.from("conversas").update({ cliente_id: clienteId, ultima_mensagem_recebida_em: timestamp }).eq("id", existente.id);
    return existente.id as string;
  }
  const { data: nova } = await admin.from("conversas").insert({ escritorio_id: escritorioId, canal: "whatsapp", cliente_id: clienteId, telefone_e164: telefone, aberta: true, ultima_mensagem_recebida_em: timestamp }).select("id").single();
  return nova?.id as string;
}

/** Intent pelo roteador de IA; sem IA ou com teto atingido, encaminha para a equipe (nunca fica sem resposta humana). */
async function classificar(admin: SupabaseClient, texto: string, ctx: { escritorioId: string; conversaId: string; ia: ClienteIa | null }): Promise<Intent> {
  if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|obrigad[ao])[!. ]*$/i.test(texto)) return "saudacao";
  if (!ctx.ia) return "falar_com_advogado";
  try {
    const { resultado } = await executarAgente(
      { admin, escritorioId: ctx.escritorioId, agente: "roteador_cliente", objeto: { tipo: "mensagem", id: null }, conversaId: ctx.conversaId, cliente: ctx.ia },
      (ia, modelo) => rotearMensagemCliente(texto, { cliente: ia, modelo }),
    );
    return resultado.dados.intent;
  } catch (e) {
    if (e instanceof ErroIa) return "falar_com_advogado";
    throw e;
  }
}

/** Leitura fixa: só a data da última movimentação, sem conteúdo. Processo sigiloso nunca tem detalhe. */
async function andamentoFixo(admin: SupabaseClient, escritorioId: string, clienteId: string): Promise<{ texto: string; sigiloso: boolean }> {
  const { data: partes } = await admin.from("processo_partes").select("processos(id, segredo_justica)").eq("escritorio_id", escritorioId).eq("cliente_id", clienteId).eq("eh_cliente", true);
  const mapa = new Map<string, boolean>();
  for (const p of (partes ?? []) as unknown as { processos: { id: string; segredo_justica: boolean } | null }[]) {
    if (p.processos) mapa.set(p.processos.id, p.processos.segredo_justica);
  }
  if (mapa.size === 0) return { texto: TEXTOS_FIXOS.semProcesso, sigiloso: false };
  if (mapa.size > 1) return { texto: TEXTOS_FIXOS.variosProcessos, sigiloso: false };
  const [[processoId, sigiloso]] = [...mapa.entries()];
  if (sigiloso) return { texto: TEXTOS_FIXOS.processoSigiloso, sigiloso: true };
  const { data: mov } = await admin.from("movimentacoes").select("data").eq("processo_id", processoId).order("data", { ascending: false }).limit(1).maybeSingle();
  return { texto: mov?.data ? TEXTOS_FIXOS.ultimaMovimentacao(dataBr(String(mov.data))) : TEXTOS_FIXOS.semMovimento, sigiloso: false };
}

/** Tarefa para a equipe + notificação (responsável e sócios). A conversa completa fica em Atendimento. */
async function registrarPedidoContato(admin: SupabaseClient, p: { escritorioId: string; clienteId: string; nomeCliente: string; conversaId: string; agora: Date }) {
  const { data: parte } = await admin.from("processo_partes").select("processos(responsavel_id)").eq("escritorio_id", p.escritorioId).eq("cliente_id", p.clienteId).eq("eh_cliente", true).limit(1).maybeSingle();
  const responsavelId = ((parte?.processos as unknown as { responsavel_id: string | null } | null)?.responsavel_id ?? null) as string | null;
  const { data: tarefa, error } = await admin
    .from("tarefas")
    .insert({
      escritorio_id: p.escritorioId,
      titulo: `Cliente pediu contato: ${p.nomeCliente}`,
      descricao: "Pedido recebido pelo WhatsApp de cliente. Veja a conversa em Atendimento. Nenhuma resposta foi enviada sem aprovação.",
      tipo: "contato_cliente",
      origem: "whatsapp",
      criado_por_tipo: "sistema",
      responsavel_id: responsavelId,
      prioridade: "alta",
      status: "a_fazer",
    })
    .select("id")
    .single();
  if (error || !tarefa) throw new Error(`Falha ao criar tarefa de contato: ${error?.message ?? "sem retorno"}`);
  const ctx = await carregarContexto(admin, p.escritorioId);
  await enfileirarEvento(admin, ctx, {
    evento: "cliente_pediu_contato",
    objeto: { tipo: "tarefa", id: tarefa.id as string },
    variaveis: { texto: `${p.nomeCliente} pediu contato pelo WhatsApp.` },
    responsavelId: responsavelId ?? undefined,
    agora: p.agora,
  });
}

/**
 * Job enviar-mensagens-cliente: consome a fila "mensagens_cliente". Revalida o consentimento e o envio
 * ligado antes de cada envio. Dentro da janela de 24 h manda texto; fora dela, o template aprovado.
 */
export async function enviarMensagensCliente(
  admin: SupabaseClient,
  opcoes: { limite?: number; agora?: Date; whatsapp?: ClienteWhatsapp | null } = {},
): Promise<{ enviadas: number; falhas: number; ignoradas: number }> {
  const agora = opcoes.agora ?? new Date();
  const { data: itens, error } = await admin.rpc("fila_ler", { p_fila: "mensagens_cliente", p_quantidade: opcoes.limite ?? 50, p_visibilidade_segundos: 240 });
  if (error) throw new Error(`fila_ler: ${error.message}`);

  const clientes = new Map<string, ClienteWhatsapp | null>();
  const whatsappDe = async (escritorioId: string): Promise<ClienteWhatsapp | null> => {
    if (opcoes.whatsapp !== undefined) return opcoes.whatsapp;
    if (!clientes.has(escritorioId)) clientes.set(escritorioId, await clienteWhatsappDoEscritorio(admin, escritorioId));
    return clientes.get(escritorioId) ?? null;
  };

  let enviadas = 0;
  let falhas = 0;
  let ignoradas = 0;
  type Item = { id: number; payload: { mensagem_id?: string } | null; tentativas: number; max_tentativas: number };

  for (const item of (itens ?? []) as Item[]) {
    const mensagemId = item.payload?.mensagem_id;
    const { data: msg } = mensagemId ? await admin.from("mensagens").select("id, escritorio_id, conversa_id, texto, status_entrega").eq("id", mensagemId).maybeSingle() : { data: null };
    if (!msg || msg.status_entrega !== "enfileirada") {
      ignoradas += 1;
      await admin.rpc("fila_concluir", { p_id: item.id });
      continue;
    }
    const escritorioId = msg.escritorio_id as string;
    const { data: conversa } = await admin.from("conversas").select("cliente_id, telefone_e164, ultima_mensagem_recebida_em").eq("id", msg.conversa_id).maybeSingle();
    const { data: esc } = await admin.from("escritorios").select("nome").eq("id", escritorioId).maybeSingle();
    const { data: regra } = await admin.from("regras_atendimento").select("envio_ativo").eq("escritorio_id", escritorioId).maybeSingle();
    const telefone = String(conversa?.telefone_e164 ?? "");
    const decisao = conversa?.cliente_id
      ? await decidirParaCliente(admin, { envioAtivo: regra?.envio_ativo === true, escritorioId, clienteId: conversa.cliente_id as string, telefone, sigiloso: false, origem: "aprovada" })
      : ({ enviar: false, motivo: "conversa sem cliente" } as const);
    if (!decisao.enviar) {
      await admin.from("mensagens").update({ status_entrega: "falhou", erro: decisao.motivo }).eq("id", msg.id);
      await admin.rpc("fila_concluir", { p_id: item.id });
      falhas += 1;
      continue;
    }

    const falhar = async (erro: string) => {
      await admin.rpc("fila_falhar", { p_id: item.id, p_erro: erro, p_atraso_segundos: 900 });
      // fila_ler já contou esta tentativa; na última, a mensagem registra a falha em vez de ficar "enfileirada".
      if (item.tentativas >= item.max_tentativas) await admin.from("mensagens").update({ status_entrega: "falhou", erro }).eq("id", msg.id);
      falhas += 1;
    };

    const whatsapp = await whatsappDe(escritorioId);
    if (!whatsapp) {
      await falhar("WhatsApp do escritório não configurado");
      continue;
    }
    const resultado = dentroDaJanela24h(conversa?.ultima_mensagem_recebida_em as string | null, agora)
      ? await whatsapp.enviarTexto(telefone, String(msg.texto ?? ""))
      : await whatsapp.enviarTemplate(telefone, montarEnvioRespostaEscritorio(String(esc?.nome ?? ""), String(msg.texto ?? "")));
    if (resultado.ok) {
      await admin.from("mensagens").update({ status_entrega: "enviada", id_externo: resultado.wamid, erro: null }).eq("id", msg.id);
      await admin.rpc("fila_concluir", { p_id: item.id });
      enviadas += 1;
    } else {
      await falhar(resultado.erro.mensagem);
    }
  }
  return { enviadas, falhas, ignoradas };
}
