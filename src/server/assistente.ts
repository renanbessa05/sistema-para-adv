import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ErroIa, rotearMensagem, roteamentoRapido, type RoteamentoIntent } from "@/lib/ia";
import { contextoDaConversa, SISTEMA as SISTEMA_ASSISTENTE } from "@/lib/ia/prompts/assistente.v1";
import { contarTurnos, montarHistorico, precisaResumo, type LinhaMensagem } from "@/lib/ia/historico";
import { hojeNoFuso, formatarBr } from "@/lib/prazos";
import { criarFerramentas } from "./ia/ferramentas";
import { executarAgente } from "./ia/executar";
import type { Sessao } from "./sessao";

/**
 * Chat da assistente no painel. Mesma lógica do WhatsApp para escrita (eco + "sim"), e a assistente com
 * ferramentas de leitura para o resto. O cliente do usuário (RLS) lê e escreve conversas/mensagens e executa as
 * RPCs; o admin só grava ia_execucoes (via executarAgente).
 */

export class ErroAssistente extends Error {}

export type EventoAssistente =
  | { tipo: "texto"; delta: string }
  | { tipo: "ferramenta"; nome: string; fase: "inicio" | "fim" }
  | { tipo: "confirmacao"; eco: string }
  | { tipo: "fim"; texto: string; mensagemId: string | null; turnos: number; pedirNovaConversa: boolean }
  | { tipo: "erro"; mensagem: string };

export interface Conversa {
  id: string;
  titulo: string | null;
  processo_id: string | null;
  turnos: number;
  encerrada_em: string | null;
  atualizado_em: string;
  criado_em: string;
  usuario_id: string | null;
}

export interface MensagemConversa {
  id: string;
  direcao: "entrada" | "saida";
  tipo: string;
  texto: string | null;
  intent: string | null;
  criado_em: string;
}

const EXPIRACAO_CONFIRMACAO_MS = 10 * 60_000;
const COLUNAS_CONVERSA = "id, titulo, processo_id, turnos, encerrada_em, atualizado_em, criado_em, usuario_id";

export async function listarConversas(supabase: SupabaseClient, sessao: Sessao, limite = 50): Promise<Conversa[]> {
  const { data } = await supabase.from("conversas").select(COLUNAS_CONVERSA).eq("canal", "painel").eq("usuario_id", sessao.usuarioId).order("atualizado_em", { ascending: false }).limit(limite);
  return (data ?? []) as unknown as Conversa[];
}

export async function obterConversa(supabase: SupabaseClient, id: string): Promise<Conversa | null> {
  const { data } = await supabase.from("conversas").select(COLUNAS_CONVERSA).eq("id", id).eq("canal", "painel").maybeSingle();
  return (data as unknown as Conversa | null) ?? null;
}

export async function listarMensagens(supabase: SupabaseClient, conversaId: string): Promise<MensagemConversa[]> {
  const { data } = await supabase.from("mensagens").select("id, direcao, tipo, texto, intent, criado_em").eq("conversa_id", conversaId).in("tipo", ["text", "texto", "sistema", "resumo"]).order("criado_em").limit(400);
  return (data ?? []) as unknown as MensagemConversa[];
}

export async function abrirConversa(sessao: Sessao, dados: { titulo?: string | null; processoId?: string | null }): Promise<string> {
  const supabase = await criarClienteServidor();
  let titulo = dados.titulo ?? null;
  if (!titulo && dados.processoId) {
    const { data: p } = await supabase.from("processos").select("numero_cnj_mascara").eq("id", dados.processoId).maybeSingle();
    titulo = p?.numero_cnj_mascara ? `Processo ${p.numero_cnj_mascara}` : null;
  }
  const { data, error } = await supabase
    .from("conversas")
    .insert({ escritorio_id: sessao.escritorioId, canal: "painel", usuario_id: sessao.usuarioId, telefone_e164: null, titulo: titulo ?? "Nova conversa", processo_id: dados.processoId ?? null, aberta: true, estado_assistente: {} })
    .select("id")
    .single();
  if (error) throw new ErroAssistente(`Não foi possível abrir a conversa: ${error.message}`);
  return data.id as string;
}

export async function renomearConversa(sessao: Sessao, id: string, titulo: string): Promise<void> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("conversas").update({ titulo: titulo || "Conversa" }).eq("id", id).eq("usuario_id", sessao.usuarioId);
  if (error) throw new ErroAssistente(error.message);
}

export async function encerrarConversa(sessao: Sessao, id: string): Promise<void> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("conversas").update({ encerrada_em: new Date().toISOString(), aberta: false }).eq("id", id).eq("usuario_id", sessao.usuarioId);
  if (error) throw new ErroAssistente(error.message);
}

/** Abre outra conversa com um resumo textual desta (as últimas respostas), sem chamar o modelo. */
export async function continuarEmNovaConversa(sessao: Sessao, id: string): Promise<string> {
  const supabase = await criarClienteServidor();
  const antiga = await obterConversa(supabase, id);
  if (!antiga) throw new ErroAssistente("Conversa não encontrada.");
  const mensagens = await listarMensagens(supabase, id);
  const resumo = mensagens
    .filter((m) => m.tipo === "text" || m.tipo === "texto")
    .slice(-12)
    .map((m) => `${m.direcao === "entrada" ? "Pessoa" : "Assistente"}: ${(m.texto ?? "").slice(0, 400)}`)
    .join("\n");
  const nova = await abrirConversa(sessao, { titulo: `${antiga.titulo ?? "Conversa"} (cont.)`, processoId: antiga.processo_id });
  if (resumo) await supabase.from("mensagens").insert({ escritorio_id: sessao.escritorioId, conversa_id: nova, direcao: "entrada", tipo: "resumo", texto: resumo });
  await encerrarConversa(sessao, id);
  return nova;
}

interface EstadoConfirmacao {
  acao?: string;
  parametros?: Record<string, unknown>;
  eco?: string;
  expira_em?: string;
}

/** Processa uma mensagem da pessoa e emite eventos (texto em streaming, ferramentas, fim). */
export async function enviarMensagem(sessao: Sessao, conversaId: string, texto: string, emitir: (e: EventoAssistente) => void): Promise<void> {
  const supabase = await criarClienteServidor();
  const admin = criarClienteAdmin();
  const { data: conversaBruta } = await supabase.from("conversas").select(`${COLUNAS_CONVERSA}, estado_assistente`).eq("id", conversaId).eq("canal", "painel").maybeSingle();
  if (!conversaBruta) throw new ErroAssistente("Conversa não encontrada.");
  if (conversaBruta.usuario_id !== sessao.usuarioId) throw new ErroAssistente("Esta conversa é de outra pessoa.");
  if (conversaBruta.encerrada_em) throw new ErroAssistente("Conversa encerrada. Abra uma nova.");
  const agora = new Date();

  await supabase.from("mensagens").insert({ escritorio_id: sessao.escritorioId, conversa_id: conversaId, direcao: "entrada", tipo: "text", texto });

  const gravarSaida = async (resposta: string, extra: { intent?: string | null; payload?: unknown; tipo?: string; iaExecucaoId?: string | null } = {}) => {
    const { data } = await supabase
      .from("mensagens")
      .insert({ escritorio_id: sessao.escritorioId, conversa_id: conversaId, direcao: "saida", tipo: extra.tipo ?? "text", texto: resposta, intent: extra.intent ?? null, payload: extra.payload ?? null, ia_execucao_id: extra.iaExecucaoId ?? null })
      .select("id")
      .single();
    return (data?.id as string | undefined) ?? null;
  };
  const terminar = async (resposta: string, extra: Parameters<typeof gravarSaida>[1] = {}) => {
    const mensagemId = await gravarSaida(resposta, extra);
    const turnos = Number(conversaBruta.turnos ?? 0) + 1;
    await supabase.from("conversas").update({ turnos, ultima_mensagem_recebida_em: agora.toISOString() }).eq("id", conversaId);
    emitir({ tipo: "fim", texto: resposta, mensagemId, turnos, pedirNovaConversa: precisaResumo(turnos) });
  };

  // 1. Confirmação pendente de ação de escrita
  const estado = (conversaBruta.estado_assistente ?? {}) as EstadoConfirmacao;
  if (estado.acao) {
    await supabase.from("conversas").update({ estado_assistente: {} }).eq("id", conversaId);
    const expirou = estado.expira_em ? new Date(estado.expira_em) < agora : true;
    if (expirou) return terminar("A confirmação expirou. Repita o pedido, por favor.");
    if (/^(sim|s|confirmo|confirma|ok|pode)$/i.test(texto.trim())) {
      const r = await executarAcaoConfirmada(supabase, estado.acao, estado.parametros ?? {});
      emitir({ tipo: "texto", delta: r });
      return terminar(r, { intent: estado.acao });
    }
    if (/^(n[aã]o|n|cancela|cancelar)$/i.test(texto.trim())) return terminar("Certo, nada foi alterado.");
    const eco = `Não entendi. Responda "sim" para confirmar ou "não" para cancelar:\n${estado.eco ?? ""}`;
    await supabase.from("conversas").update({ estado_assistente: estado }).eq("id", conversaId);
    emitir({ tipo: "confirmacao", eco });
    return terminar(eco);
  }

  // 2. Contexto do escritório
  const [{ data: esc }, { data: membros }] = await Promise.all([
    supabase.from("escritorios").select("nome, timezone").eq("id", sessao.escritorioId).maybeSingle(),
    supabase.from("escritorio_membros").select("usuario_id, nome_completo").eq("escritorio_id", sessao.escritorioId).eq("ativo", true),
  ]);
  const timezone = (esc?.timezone as string | undefined) ?? "America/Cuiaba";
  const nomesDaEquipe = (membros ?? []).map((m) => m.nome_completo as string);

  // 3. Roteamento (rápido por regra; senão pelo modelo barato)
  let roteamento: RoteamentoIntent;
  const rapido = roteamentoRapido(texto);
  if (rapido) roteamento = rapido;
  else {
    try {
      const { resultado } = await executarAgente({ admin, escritorioId: sessao.escritorioId, agente: "roteador_intents", agenteVersao: "roteador-intents.v1", objeto: { tipo: "mensagem", id: null }, conversaId }, (ia, modelo) => rotearMensagem(texto, { cliente: ia, modelo, nomesDaEquipe, canal: "painel" }));
      roteamento = resultado.dados;
    } catch (e) {
      if (e instanceof ErroIa) return terminar(mensagemDeErroIa(e));
      throw e;
    }
  }

  // 4. Escrita: eco + confirmação, executada pelas RPCs com o papel do usuário
  if (["reatribuir_tarefa", "concluir_tarefa", "confirmar_prazo"].includes(roteamento.intent)) {
    if (!["socio", "advogado"].includes(sessao.papel)) return terminar("Reatribuir, concluir e confirmar são ações de advogado ou sócio. Peça a um deles ou use a tela da tarefa.", { intent: roteamento.intent });
    if (roteamento.confianca < 0.6) return terminar("Não tenho certeza do que você quer alterar. Repita com o número do processo e o nome da pessoa ou da tarefa.", { intent: roteamento.intent });
    const r = await prepararEscrita(supabase, sessao, roteamento);
    if (r.estado) {
      await supabase.from("conversas").update({ estado_assistente: { ...r.estado, expira_em: new Date(agora.getTime() + EXPIRACAO_CONFIRMACAO_MS).toISOString() } }).eq("id", conversaId);
      emitir({ tipo: "confirmacao", eco: r.texto });
    } else {
      emitir({ tipo: "texto", delta: r.texto });
    }
    return terminar(r.texto, { intent: roteamento.intent });
  }

  if (roteamento.intent === "saudacao" && roteamento.resposta_curta) {
    emitir({ tipo: "texto", delta: roteamento.resposta_curta });
    return terminar(roteamento.resposta_curta, { intent: "saudacao" });
  }
  if (roteamento.intent === "fora_do_escopo" && roteamento.resposta_curta) {
    emitir({ tipo: "texto", delta: roteamento.resposta_curta });
    return terminar(roteamento.resposta_curta, { intent: "fora_do_escopo" });
  }
  if (roteamento.intent === "abrir_agente" || roteamento.intent === "calcular" || roteamento.intent === "buscar_jurisprudencia") {
    const r = textoAbrirAgente(roteamento, conversaBruta.processo_id as string | null);
    emitir({ tipo: "texto", delta: r });
    return terminar(r, { intent: roteamento.intent });
  }

  // 5. Assistente com ferramentas de leitura
  const { data: linhas } = await supabase.from("mensagens").select("direcao, tipo, texto, payload").eq("conversa_id", conversaId).order("criado_em").limit(400);
  const historico = montarHistorico(((linhas ?? []) as LinhaMensagem[]).slice(0, -1));
  const turnosAtuais = contarTurnos((linhas ?? []) as LinhaMensagem[]);
  let processoFoco: { numero: string; id: string } | null = null;
  if (conversaBruta.processo_id) {
    const { data: p } = await supabase.from("processos").select("numero_cnj_mascara").eq("id", conversaBruta.processo_id as string).maybeSingle();
    if (p) processoFoco = { numero: (p.numero_cnj_mascara as string | null) ?? "sem número", id: conversaBruta.processo_id as string };
  }
  const cabecalho = contextoDaConversa({ dataHoje: formatarBr(hojeNoFuso(timezone, agora)), nomeUsuario: sessao.nome, papel: sessao.papel, escritorio: (esc?.nome as string | undefined) ?? "escritório", processo: processoFoco, timezone });
  const mensagens = [...historico, { role: "user" as const, content: `${cabecalho}\n\n${texto}` }];
  const ferramentas = criarFerramentas(supabase, sessao, { timezone });

  try {
    const { resultado, execucaoId } = await executarAgente({ admin, escritorioId: sessao.escritorioId, agente: "assistente", objeto: { tipo: "conversa", id: conversaId }, conversaId }, (ia, modelo) =>
      ia.conversar({
        agente: "assistente",
        modelo,
        sistema: SISTEMA_ASSISTENTE,
        cacheSistema: true,
        mensagens,
        ferramentas,
        maxTokens: 4096,
        effort: "medium",
        maxIteracoes: 8,
        aoTexto: (delta) => emitir({ tipo: "texto", delta }),
        aoFerramenta: (nome, fase) => emitir({ tipo: "ferramenta", nome, fase }),
      }),
    );
    // Histórico append-only: blocos do assistente inteiros e resultados de ferramenta como linhas 'ferramenta'
    for (const m of resultado.novasMensagens) {
      if (m.role === "assistant") {
        const ehUltima = m === resultado.novasMensagens[resultado.novasMensagens.length - 1];
        if (!ehUltima) await gravarSaida("", { tipo: "ferramenta", payload: m.content, intent: "pergunta_livre" });
      } else {
        await gravarSaida("", { tipo: "ferramenta", payload: m.content });
      }
    }
    const ultima = resultado.novasMensagens[resultado.novasMensagens.length - 1];
    const mensagemId = await gravarSaida(resultado.texto, { intent: roteamento.intent, payload: ultima?.role === "assistant" ? ultima.content : null, iaExecucaoId: execucaoId });
    const turnos = turnosAtuais;
    await supabase.from("conversas").update({ turnos, ultima_mensagem_recebida_em: agora.toISOString() }).eq("id", conversaId);
    emitir({ tipo: "fim", texto: resultado.texto, mensagemId, turnos, pedirNovaConversa: precisaResumo(turnos) });
  } catch (e) {
    if (e instanceof ErroIa) {
      const msg = mensagemDeErroIa(e);
      emitir({ tipo: "texto", delta: msg });
      await terminar(msg, { tipo: "sistema" });
      return;
    }
    throw e;
  }
}

function mensagemDeErroIa(e: ErroIa): string {
  if (e.tipo === "cancelado_teto") return "O escritório atingiu o teto mensal de IA. Um sócio pode ajustar o teto em Configurações.";
  if (e.tipo === "recusado") return "Não posso ajudar com esse pedido.";
  return `A assistente não conseguiu responder agora (${e.message}). Tente de novo em instantes.`;
}

function textoAbrirAgente(r: RoteamentoIntent, processoId: string | null): string {
  const sufixo = processoId ? `?processo=${processoId}` : "";
  const mapa: Record<string, { rotulo: string; href: string }> = {
    honorarios: { rotulo: "Contratos e honorários", href: "/contratos/novo" },
    peticao: { rotulo: "Peças (minuta em etapas)", href: `/minutas/nova${sufixo}` },
    varredura: { rotulo: "Varredura dos autos", href: `/varreduras/nova${sufixo}` },
    revisor: { rotulo: "Revisor de peças", href: "/revisor" },
    julgador: { rotulo: "Como o juiz vai decidir", href: processoId ? `/processos/${processoId}/analises` : "/processos" },
    outros_tribunais: { rotulo: "Análise em outros tribunais", href: processoId ? `/processos/${processoId}/analises` : "/processos" },
    calculo: { rotulo: "Cálculos", href: `/calculos/novo${sufixo}` },
    jurisprudencia: { rotulo: "Jurisprudência", href: "/jurisprudencia" },
  };
  const chave = r.intent === "calcular" ? "calculo" : r.intent === "buscar_jurisprudencia" ? "jurisprudencia" : (r.entidades.agente ?? "peticao");
  const alvo = mapa[chave] ?? mapa.peticao;
  return `Isso é trabalho do agente **${alvo.rotulo}**, que tem tela própria com aprovação por etapa. Abra em [${alvo.href}](${alvo.href}). Se a tela ainda não existir nesta versão, ela faz parte dos próximos lotes da Fase 2.`;
}

async function executarAcaoConfirmada(supabase: SupabaseClient, acao: string, p: Record<string, unknown>): Promise<string> {
  try {
    if (acao === "reatribuir_tarefa") {
      const { error } = await supabase.rpc("reatribuir_tarefa", { p_id: p.tarefa_id, p_para_usuario: p.para, p_motivo: "pela assistente" });
      if (error) throw error;
      return "Tarefa reatribuída.";
    }
    if (acao === "concluir_tarefa") {
      const { error } = await supabase.rpc("concluir_tarefa", { p_id: p.tarefa_id, p_protocolado: Boolean(p.protocolado) });
      if (error) throw error;
      return Boolean(p.protocolado) ? "Tarefa concluída e prazo marcado como cumprido." : "Tarefa concluída.";
    }
    if (acao === "confirmar_prazo") {
      const { error } = await supabase.rpc("confirmar_prazo", { p_id: p.prazo_id });
      if (error) throw error;
      return "Prazo confirmado.";
    }
    return "Ação desconhecida; nada foi alterado.";
  } catch (e) {
    return `Não consegui executar: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function localizarProcessos(supabase: SupabaseClient, termo: string | null) {
  if (!termo) return [] as { id: string; numero: string }[];
  const digitos = termo.replace(/\D/g, "");
  let ids: string[] = [];
  if (digitos.length >= 5) {
    const { data } = await supabase.from("processos").select("id").like("numero_cnj", `${digitos.length >= 20 ? digitos : digitos.slice(0, 7)}%`).limit(6);
    ids = (data ?? []).map((p) => p.id as string);
  } else {
    const { data } = await supabase.from("processo_partes").select("processo_id").ilike("nome", `%${termo.replace(/[%,]/g, "")}%`).limit(10);
    ids = [...new Set((data ?? []).map((p) => p.processo_id as string))];
  }
  if (!ids.length) return [];
  const { data } = await supabase.from("processos").select("id, numero_cnj_mascara").in("id", ids).limit(6);
  return (data ?? []).map((p) => ({ id: p.id as string, numero: (p.numero_cnj_mascara as string | null) ?? "sem número" }));
}

async function prepararEscrita(supabase: SupabaseClient, sessao: Sessao, r: RoteamentoIntent): Promise<{ texto: string; estado?: EstadoConfirmacao }> {
  const processos = await localizarProcessos(supabase, r.entidades.processo);
  if (r.intent === "confirmar_prazo") {
    if (processos.length !== 1) return { texto: processos.length ? "Mais de um processo bate. Repita com o número completo." : "Não achei o processo. Diga o número ou o nome do cliente." };
    const { data: sugeridos } = await supabase.from("prazos").select("id, ato_descricao, data_final, calendario_incompleto").eq("processo_id", processos[0].id).eq("status", "sugerido").order("criado_em", { ascending: false }).limit(1);
    const p = sugeridos?.[0];
    if (!p) return { texto: `Não há prazo sugerido pendente no processo ${processos[0].numero}.` };
    if (p.calendario_incompleto) return { texto: `O prazo sugerido (${p.ato_descricao}, ${formatarBr(String(p.data_final))}) está com calendário incompleto: confirme na tela [/prazos/${p.id}](/prazos/${p.id}), onde a memória de cálculo aparece.` };
    const eco = `Confirmar prazo "${p.ato_descricao}" do processo ${processos[0].numero} com data final ${formatarBr(String(p.data_final))}. Confirma? (sim/não)`;
    return { texto: eco, estado: { acao: "confirmar_prazo", parametros: { prazo_id: p.id }, eco } };
  }
  if (processos.length > 1) return { texto: "Mais de um processo bate. Repita com o número completo." };
  let q = supabase.from("tarefas").select("id, titulo, prazo_id, processos(numero_cnj_mascara)").not("status", "in", "(concluida,cancelada)").limit(5);
  if (processos.length === 1) q = q.eq("processo_id", processos[0].id);
  if (r.entidades.tarefa) q = q.ilike("titulo", `%${r.entidades.tarefa.replace(/[%,]/g, "")}%`);
  const { data: tarefas } = await q;
  if (!tarefas?.length) return { texto: "Não encontrei essa tarefa aberta." };
  if (tarefas.length > 1) return { texto: `Encontrei ${tarefas.length} tarefas:\n${tarefas.map((t, i) => `${i + 1}. ${t.titulo}`).join("\n")}\nRepita dizendo qual.` };
  const t = tarefas[0];
  const numero = (t.processos as unknown as { numero_cnj_mascara: string | null } | null)?.numero_cnj_mascara ?? "sem processo";
  if (r.intent === "reatribuir_tarefa") {
    const { data: membros } = await supabase.from("escritorio_membros").select("usuario_id, nome_completo").eq("escritorio_id", sessao.escritorioId).eq("ativo", true).not("usuario_id", "is", null).ilike("nome_completo", `%${(r.entidades.pessoa ?? "").replace(/[%,]/g, "")}%`).limit(2);
    if (!r.entidades.pessoa || membros?.length !== 1) return { texto: "Para quem? Não encontrei essa pessoa na equipe (ou há mais de uma com esse nome)." };
    const eco = `Reatribuir "${t.titulo}" (${numero}) para ${membros[0].nome_completo}. Confirma? (sim/não)`;
    return { texto: eco, estado: { acao: "reatribuir_tarefa", parametros: { tarefa_id: t.id, para: membros[0].usuario_id }, eco } };
  }
  const eco = `Concluir "${t.titulo}" (${numero})${t.prazo_id ? " e marcar o prazo como cumprido" : ""}. Confirma? (sim/não)`;
  return { texto: eco, estado: { acao: "concluir_tarefa", parametros: { tarefa_id: t.id, protocolado: Boolean(t.prazo_id) }, eco } };
}
