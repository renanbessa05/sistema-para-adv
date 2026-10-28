import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteIa, rotearMensagem, type ClienteIa, type RoteamentoIntent } from "@/lib/ia";
import { criarClienteWhatsapp, extrairEventos, type ClienteWhatsapp, type MensagemRecebida } from "@/lib/whatsapp";
import { calcularPeriodos, formatarBr } from "@/lib/prazos";
import { envServidor } from "@/lib/config/env";
import { carregarCalendario } from "./calendario";

/**
 * Atendimento da equipe pelo WhatsApp: lista fechada de intents.
 * Leitura responde direto; escrita exige eco + "sim" e passa pelas RPCs do banco com o papel do usuário.
 * Texto de processo sigiloso nunca sai por aqui.
 */

interface Identidade {
  escritorioId: string;
  usuarioId: string;
  nome: string;
  papel: string;
  timezone: string;
}

const LIMITE_MENSAGENS_HORA = 20;
const EXPIRACAO_CONFIRMACAO_MS = 10 * 60_000;

export async function processarWebhook(admin: SupabaseClient, payload: unknown, deps: { whatsapp?: ClienteWhatsapp | null; ia?: ClienteIa | null; agora?: Date } = {}) {
  const env = envServidor();
  const whatsapp = deps.whatsapp === undefined ? (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID ? criarClienteWhatsapp({ accessToken: env.WHATSAPP_ACCESS_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID }) : null) : deps.whatsapp;
  const ia = deps.ia === undefined ? (env.ANTHROPIC_API_KEY ? criarClienteIa({ apiKey: env.ANTHROPIC_API_KEY }) : null) : deps.ia;
  const { mensagens, statuses } = extrairEventos(payload, () => deps.agora ?? new Date());

  for (const s of statuses) {
    const mapa: Record<string, string> = { sent: "enviada", delivered: "entregue", read: "lida", failed: "falhou" };
    await admin.from("mensagens").update({ status_entrega: mapa[s.status] ?? "enviada", erro: s.status === "failed" ? JSON.stringify(s.erros ?? null) : null }).eq("id_externo", s.wamid);
  }

  const respostas: { wamid: string; resposta: string | null }[] = [];
  for (const m of mensagens) {
    // Idempotência: a Meta reenvia por até 7 dias.
    const { error: erroInbox } = await admin.from("webhooks_inbox").insert({ fonte: "whatsapp", id_externo: m.wamid, payload: m.payload_bruto, recebido_em: new Date().toISOString() });
    if (erroInbox) continue;
    const resposta = await tratarMensagem(admin, m, { whatsapp, ia, agora: deps.agora ?? new Date() });
    await admin.from("webhooks_inbox").update({ processado_em: new Date().toISOString() }).eq("fonte", "whatsapp").eq("id_externo", m.wamid);
    respostas.push({ wamid: m.wamid, resposta });
  }
  return respostas;
}

async function tratarMensagem(admin: SupabaseClient, m: MensagemRecebida, deps: { whatsapp: ClienteWhatsapp | null; ia: ClienteIa | null; agora: Date }): Promise<string | null> {
  const telefone = m.telefone_e164;
  const { data: tel } = await admin.from("usuario_telefones").select("escritorio_id, usuario_id, verificado_em, opt_in_em").eq("telefone_e164", telefone).eq("ativo", true).maybeSingle();

  const responder = async (texto: string) => {
    if (deps.whatsapp) await deps.whatsapp.enviarTexto(telefone, texto);
    return texto;
  };

  if (!tel) {
    return responder("Este número não está cadastrado na equipe. Peça a um sócio para cadastrar seu telefone no painel.");
  }
  if (!tel.verificado_em) {
    const codigo = m.texto?.trim().replace(/\D/g, "");
    if (codigo && codigo.length === 6) {
      const { data: ok } = await admin.rpc("verificar_telefone", { p_telefone: telefone, p_codigo: codigo });
      if (ok) return responder("Telefone verificado. Agora é só mandar 'bom dia' para receber seu resumo.");
    }
    return responder("Seu telefone ainda não foi verificado. Digite o código de 6 dígitos mostrado no painel em Configurações → Equipe.");
  }

  const { data: membro } = await admin.from("escritorio_membros").select("nome_completo, papel").eq("escritorio_id", tel.escritorio_id).eq("usuario_id", tel.usuario_id).eq("ativo", true).maybeSingle();
  if (!membro) return responder("Seu acesso está inativo. Fale com um sócio.");
  const { data: esc } = await admin.from("escritorios").select("timezone").eq("id", tel.escritorio_id).single();
  const id: Identidade = { escritorioId: tel.escritorio_id as string, usuarioId: tel.usuario_id as string, nome: membro.nome_completo as string, papel: membro.papel as string, timezone: (esc?.timezone as string) ?? "America/Cuiaba" };

  // Conversa e proteção de ritmo
  const { data: conversaExistente } = await admin.from("conversas").select("id, estado_assistente").eq("escritorio_id", id.escritorioId).eq("canal", "whatsapp").eq("telefone_e164", telefone).maybeSingle();
  let conversaId = conversaExistente?.id as string | undefined;
  if (!conversaId) {
    const { data: nova } = await admin.from("conversas").insert({ escritorio_id: id.escritorioId, canal: "whatsapp", usuario_id: id.usuarioId, telefone_e164: telefone, aberta: true }).select("id").single();
    conversaId = nova?.id as string;
  }
  await admin.from("conversas").update({ ultima_mensagem_recebida_em: m.timestamp, usuario_id: id.usuarioId }).eq("id", conversaId);
  await admin.from("mensagens").insert({ escritorio_id: id.escritorioId, conversa_id: conversaId, direcao: "entrada", id_externo: m.wamid, tipo: m.tipo, texto: m.texto, payload: m.payload_bruto, status_entrega: "entregue" });
  if (deps.whatsapp) await deps.whatsapp.marcarComoLida(m.wamid);

  const { count } = await admin.from("mensagens").select("id", { count: "exact", head: true }).eq("conversa_id", conversaId).eq("direcao", "entrada").gte("criado_em", new Date(deps.agora.getTime() - 3_600_000).toISOString());
  if ((count ?? 0) > LIMITE_MENSAGENS_HORA) return responder("Muitas mensagens na última hora. Tente de novo mais tarde ou use o painel.");

  const registrarSaida = async (texto: string, intent?: string) => {
    const enviado = deps.whatsapp ? await deps.whatsapp.enviarTexto(telefone, texto) : null;
    await admin.from("mensagens").insert({ escritorio_id: id.escritorioId, conversa_id: conversaId, direcao: "saida", id_externo: enviado && enviado.ok ? enviado.wamid : null, tipo: "text", texto, status_entrega: enviado && enviado.ok ? "enviada" : enviado ? "falhou" : "enfileirada", intent: intent ?? null });
    return texto;
  };

  const texto = (m.texto ?? "").trim();
  if (!texto) return registrarSaida("Só entendo texto por enquanto. Me diga o que precisa, por exemplo: 'meus prazos da semana'.");

  // Confirmação pendente de ação de escrita
  const estado = (conversaExistente?.estado_assistente ?? null) as { acao?: string; parametros?: Record<string, unknown>; eco?: string; expira_em?: string } | null;
  if (estado?.acao) {
    const expirou = estado.expira_em ? new Date(estado.expira_em) < deps.agora : true;
    await admin.from("conversas").update({ estado_assistente: null }).eq("id", conversaId);
    if (expirou) return registrarSaida("A confirmação expirou. Repita o pedido, por favor.");
    if (/^(sim|s|confirmo|confirma|ok|pode)$/i.test(texto)) {
      return registrarSaida(await executarAcaoConfirmada(admin, id, estado.acao, estado.parametros ?? {}), estado.acao);
    }
    if (/^(n[aã]o|n|cancela|cancelar)$/i.test(texto)) return registrarSaida("Certo, nada foi alterado.");
    return registrarSaida(`Não entendi. Responda "sim" para confirmar ou "não" para cancelar:\n${estado.eco ?? ""}`);
  }

  if (!deps.ia) return registrarSaida("A assistente está sem o modelo de IA configurado. Use o painel por enquanto.");
  const { data: equipe } = await admin.from("escritorio_membros").select("nome_completo").eq("escritorio_id", id.escritorioId).eq("ativo", true);
  const roteamento = await rotearMensagem(texto, { cliente: deps.ia, modelo: envServidor().IA_MODELO_TRIAGEM, nomesDaEquipe: (equipe ?? []).map((e) => e.nome_completo as string) });
  if (roteamento.modelo !== "regra") {
    await admin.from("ia_execucoes").insert({ escritorio_id: id.escritorioId, agente: roteamento.agente, agente_versao: roteamento.agenteVersao, modelo: roteamento.modelo, input_tokens: roteamento.uso.input, output_tokens: roteamento.uso.output, cache_creation_input_tokens: roteamento.uso.cacheWrite, cache_read_input_tokens: roteamento.uso.cacheRead, latencia_ms: roteamento.latenciaMs, status: "ok", request_id: roteamento.requestId, objeto_tipo: "mensagem", objeto_id: null });
  }
  const r = roteamento.dados;
  if (roteamento.ehEscrita && !["socio", "advogado"].includes(id.papel)) return registrarSaida("Pelo WhatsApp, só advogados e sócios podem reatribuir, concluir ou confirmar. Abra no painel.", r.intent);
  if (roteamento.ehEscrita && r.confianca < 0.6) return registrarSaida("Não tenho certeza do que você quer alterar. Pode repetir com o número do processo e o nome da pessoa?", r.intent);

  const resposta = await responderIntent(admin, id, r, conversaId, deps.agora);
  return registrarSaida(resposta, r.intent);
}

async function responderIntent(admin: SupabaseClient, id: Identidade, r: RoteamentoIntent, conversaId: string, agora: Date): Promise<string> {
  const env = envServidor();
  const calendario = await carregarCalendario(admin, { tribunalId: null, comarcaId: null });
  const periodos = calcularPeriodos(calendario, { timeZone: id.timezone, agora });
  const socio = id.papel === "socio";

  const listarPrazos = async (de: string, ate: string) => {
    let q = admin.from("prazos").select("id, ato_descricao, data_final, data_interna, status, responsavel_id, processos(numero_cnj_mascara, segredo_justica)").eq("escritorio_id", id.escritorioId).in("status", ["confirmado", "prorrogado", "vencido"]).gte("data_final", de).lte("data_final", ate).order("data_final");
    if (!socio) q = q.eq("responsavel_id", id.usuarioId);
    const { data } = await q;
    return (data ?? []).map((p) => {
      const proc = p.processos as unknown as { numero_cnj_mascara: string | null } | null;
      return `• ${formatarBr(String(p.data_final))} ${p.ato_descricao} · ${proc?.numero_cnj_mascara ?? "sem processo"}${p.status === "vencido" ? " (VENCIDO)" : ""}`;
    });
  };

  switch (r.intent) {
    case "saudacao":
      return r.resposta_curta ?? "Olá!";
    case "fora_do_escopo":
      return `${r.resposta_curta ?? "Isso ainda não faço pelo WhatsApp."} Painel: ${env.APP_URL}`;
    case "resumo_do_dia": {
      const hoje = await listarPrazos(periodos.hoje, periodos.hoje);
      const amanha = await listarPrazos(periodos.amanha, periodos.amanha);
      const { count: novas } = await admin.from("publicacoes").select("id", { count: "exact", head: true }).eq("escritorio_id", id.escritorioId).in("status", ["nova", "classificada", "vinculada", "sem_processo", "com_prazo_sugerido"]);
      const { count: sugeridos } = await admin.from("prazos").select("id", { count: "exact", head: true }).eq("escritorio_id", id.escritorioId).eq("status", "sugerido");
      return [`Bom dia, ${id.nome.split(" ")[0]}! ${formatarBr(periodos.hoje)}`, `📬 ${novas ?? 0} publicação(ões) a tratar · ⏳ ${sugeridos ?? 0} prazo(s) sugerido(s) a confirmar`, `Hoje: ${hoje.length ? "\n" + hoje.join("\n") : "nenhum prazo"}`, `Amanhã (${formatarBr(periodos.amanha)}): ${amanha.length ? "\n" + amanha.join("\n") : "nenhum prazo"}`, `Painel: ${env.APP_URL}/hoje`].join("\n");
    }
    case "prazos_hoje_amanha": {
      const itens = await listarPrazos(periodos.hoje, periodos.amanha);
      return itens.length ? `Prazos de hoje e amanhã:\n${itens.join("\n")}` : "Nenhum prazo hoje nem amanhã.";
    }
    case "prazos_semana": {
      const itens = await listarPrazos(periodos.hoje, periodos.semanaFim);
      return itens.length ? `Prazos até ${formatarBr(periodos.semanaFim)}:\n${itens.join("\n")}` : `Nenhum prazo até ${formatarBr(periodos.semanaFim)}.`;
    }
    case "movimentos_processo": {
      const processos = await encontrarProcessos(admin, id, r.entidades.processo);
      if (processos.length === 0) return "Não achei esse processo na carteira. Diga o número ou o nome do cliente.";
      if (processos.length > 1) return `Encontrei mais de um:\n${processos.slice(0, 5).map((p, i) => `${i + 1}. ${p.numero_cnj_mascara} · ${p.cliente ?? ""}`).join("\n")}\nRepita com o número completo.`;
      const p = processos[0];
      if (p.segredo_justica) return `O processo ${p.numero_cnj_mascara} corre em segredo de justiça: há movimentação ou publicação nova? Veja no painel: ${env.APP_URL}/processos/${p.id}`;
      const { data: movs } = await admin.from("movimentacoes").select("data, nome, complemento").eq("processo_id", p.id).order("data", { ascending: false }).limit(5);
      const { data: pubs } = await admin.from("publicacoes").select("data_disponibilizacao, resumo_ia, tipo").eq("processo_id", p.id).order("data_disponibilizacao", { ascending: false }).limit(3);
      const linhasPub = (pubs ?? []).map((x) => `📰 ${formatarBr(String(x.data_disponibilizacao))} ${x.tipo ?? ""}: ${x.resumo_ia ?? "(sem resumo)"}`);
      const linhasMov = (movs ?? []).map((x) => `• ${formatarBr(String(x.data).slice(0, 10))} ${x.nome}${x.complemento ? ` (${x.complemento})` : ""}`);
      return [`Processo ${p.numero_cnj_mascara}${p.cliente ? ` · ${p.cliente}` : ""}`, ...linhasPub, linhasMov.length ? "Últimas movimentações:" : "Sem movimentações no DataJud ainda.", ...linhasMov, `${env.APP_URL}/processos/${p.id}`].join("\n");
    }
    case "tarefas_pessoa": {
      const pessoa = await encontrarMembro(admin, id, r.entidades.pessoa);
      const alvo = pessoa ?? { usuario_id: id.usuarioId, nome_completo: id.nome };
      if (!socio && alvo.usuario_id !== id.usuarioId) return "Você só pode ver as suas tarefas por aqui.";
      const { data: tarefas } = await admin.from("tarefas").select("titulo, vencimento, status").eq("escritorio_id", id.escritorioId).eq("executor_id", alvo.usuario_id).not("status", "in", "(concluida,cancelada)").order("vencimento").limit(10);
      return tarefas?.length ? `Tarefas de ${alvo.nome_completo.split(" ")[0]}:\n${tarefas.map((t) => `• ${t.vencimento ? formatarBr(String(t.vencimento)) : "sem data"} ${t.titulo}${t.vencimento && String(t.vencimento) < periodos.hoje ? " (atrasada)" : ""}`).join("\n")}` : `Nenhuma tarefa aberta para ${alvo.nome_completo.split(" ")[0]}.`;
    }
    case "reatribuir_tarefa": {
      const pessoa = await encontrarMembro(admin, id, r.entidades.pessoa);
      if (!pessoa) return "Para quem? Não encontrei essa pessoa na equipe.";
      const tarefa = await encontrarTarefa(admin, id, r.entidades.processo, r.entidades.tarefa);
      if ("erro" in tarefa) return tarefa.erro;
      const eco = `Reatribuir "${tarefa.titulo}" (${tarefa.processo ?? "sem processo"}) para ${pessoa.nome_completo}. Confirma? (sim/não)`;
      await guardarConfirmacao(admin, conversaId, { acao: "reatribuir_tarefa", parametros: { tarefa_id: tarefa.id, para: pessoa.usuario_id }, eco }, agora);
      return eco;
    }
    case "concluir_tarefa": {
      const tarefa = await encontrarTarefa(admin, id, r.entidades.processo, r.entidades.tarefa);
      if ("erro" in tarefa) return tarefa.erro;
      const eco = `Concluir "${tarefa.titulo}" (${tarefa.processo ?? "sem processo"})${tarefa.prazo_id ? " e marcar o prazo como cumprido" : ""}. Confirma? (sim/não)`;
      await guardarConfirmacao(admin, conversaId, { acao: "concluir_tarefa", parametros: { tarefa_id: tarefa.id, protocolado: Boolean(tarefa.prazo_id) }, eco }, agora);
      return eco;
    }
    case "confirmar_prazo": {
      const processos = await encontrarProcessos(admin, id, r.entidades.processo);
      if (processos.length !== 1) return processos.length ? "Mais de um processo bate. Repita com o número completo." : "Não achei o processo.";
      const { data: sugeridos } = await admin.from("prazos").select("id, ato_descricao, data_final, calendario_incompleto").eq("processo_id", processos[0].id).eq("status", "sugerido").order("criado_em", { ascending: false }).limit(1);
      const p = sugeridos?.[0];
      if (!p) return `Não há prazo sugerido pendente no processo ${processos[0].numero_cnj_mascara}.`;
      if (p.calendario_incompleto) return `O prazo sugerido (${p.ato_descricao}, ${formatarBr(String(p.data_final))}) está marcado "calendário incompleto": confirme pelo painel, onde a memória de cálculo aparece. ${env.APP_URL}/prazos/${p.id}`;
      const eco = `Confirmar prazo "${p.ato_descricao}" do processo ${processos[0].numero_cnj_mascara} com data final ${formatarBr(String(p.data_final))}. Confirma? (sim/não)`;
      await guardarConfirmacao(admin, conversaId, { acao: "confirmar_prazo", parametros: { prazo_id: p.id }, eco }, agora);
      return eco;
    }
    default:
      return `Isso ainda não faço pelo WhatsApp. Painel: ${env.APP_URL}`;
  }
}

async function guardarConfirmacao(admin: SupabaseClient, conversaId: string, estado: { acao: string; parametros: Record<string, unknown>; eco: string }, agora: Date) {
  await admin.from("conversas").update({ estado_assistente: { ...estado, expira_em: new Date(agora.getTime() + EXPIRACAO_CONFIRMACAO_MS).toISOString() } }).eq("id", conversaId);
}

/** Executa a ação confirmada pelas RPCs do banco como se fosse o usuário (wrapper `whatsapp_executar` na migration 0014). */
async function executarAcaoConfirmada(admin: SupabaseClient, id: Identidade, acao: string, parametros: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.rpc("whatsapp_executar", { p_usuario_id: id.usuarioId, p_acao: acao, p_parametros: parametros });
  if (error) return `Não consegui executar: ${error.message}`;
  const r = (data ?? {}) as { ok?: boolean; mensagem?: string };
  return r.mensagem ?? (r.ok ? "Feito." : "Não foi possível executar.");
}

async function encontrarProcessos(admin: SupabaseClient, id: Identidade, termo: string | null) {
  if (!termo) return [];
  const digitos = termo.replace(/\D/g, "");
  let q = admin.from("processos").select("id, numero_cnj, numero_cnj_mascara, segredo_justica, processo_partes(nome, eh_cliente)").eq("escritorio_id", id.escritorioId).in("status", ["ativo", "suspenso"]).limit(6);
  if (digitos.length >= 5) q = q.like("numero_cnj", `${digitos.length >= 20 ? digitos : digitos.slice(0, 7)}%`);
  else q = q.or(`processo_partes.nome.ilike.%${termo.replace(/[%,]/g, "")}%`);
  const { data } = await q;
  let lista = data ?? [];
  if (digitos.length < 5) {
    const { data: partes } = await admin.from("processo_partes").select("processo_id").eq("escritorio_id", id.escritorioId).ilike("nome", `%${termo.replace(/[%,]/g, "")}%`).limit(10);
    const ids = [...new Set((partes ?? []).map((p) => p.processo_id as string))];
    if (ids.length) {
      const { data: porParte } = await admin.from("processos").select("id, numero_cnj, numero_cnj_mascara, segredo_justica, processo_partes(nome, eh_cliente)").in("id", ids).limit(6);
      lista = porParte ?? [];
    }
  }
  return lista.map((p) => ({ id: p.id as string, numero_cnj_mascara: p.numero_cnj_mascara as string, segredo_justica: Boolean(p.segredo_justica), cliente: ((p.processo_partes as { nome: string; eh_cliente: boolean }[] | null) ?? []).find((x) => x.eh_cliente)?.nome ?? null }));
}

async function encontrarMembro(admin: SupabaseClient, id: Identidade, nome: string | null) {
  if (!nome) return null;
  const { data } = await admin.from("escritorio_membros").select("usuario_id, nome_completo").eq("escritorio_id", id.escritorioId).eq("ativo", true).not("usuario_id", "is", null).ilike("nome_completo", `%${nome.replace(/[%,]/g, "")}%`).limit(2);
  return data?.length === 1 ? { usuario_id: data[0].usuario_id as string, nome_completo: data[0].nome_completo as string } : null;
}

async function encontrarTarefa(admin: SupabaseClient, id: Identidade, processoTermo: string | null, tarefaTermo: string | null): Promise<{ id: string; titulo: string; processo: string | null; prazo_id: string | null } | { erro: string }> {
  const processos = await encontrarProcessos(admin, id, processoTermo);
  let q = admin.from("tarefas").select("id, titulo, prazo_id, processos(numero_cnj_mascara)").eq("escritorio_id", id.escritorioId).not("status", "in", "(concluida,cancelada)").limit(5);
  if (processos.length === 1) q = q.eq("processo_id", processos[0].id);
  else if (processos.length > 1) return { erro: "Mais de um processo bate. Repita com o número completo." };
  if (tarefaTermo) q = q.ilike("titulo", `%${tarefaTermo.replace(/[%,]/g, "")}%`);
  const { data } = await q;
  if (!data?.length) return { erro: "Não encontrei essa tarefa aberta." };
  if (data.length > 1) return { erro: `Encontrei ${data.length} tarefas:\n${data.map((t, i) => `${i + 1}. ${t.titulo}`).join("\n")}\nRepita dizendo qual.` };
  const t = data[0];
  return { id: t.id as string, titulo: t.titulo as string, processo: (t.processos as unknown as { numero_cnj_mascara: string | null } | null)?.numero_cnj_mascara ?? null, prazo_id: (t.prazo_id as string | null) ?? null };
}
