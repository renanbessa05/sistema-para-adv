import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { delimitarDado, ErroIa, type DocumentoEntrada } from "@/lib/ia";
import { REFERENCIAS, SISTEMA as SISTEMA_PETICAO } from "@/lib/ia/prompts/peticao.v1";
import { ESQUEMAS_ETAPAS, TITULO_ETAPA, type AreaDireito, type Etapa6, type TipoPeca } from "@/lib/ia/schemas/minutas";
import { montarMensagemIntake, type IntakeMinuta } from "@/lib/pecas/intake";
import { validarPeca, type ResultadoValidacao } from "@/lib/pecas/validar";
import { markdownParaDocx } from "@/lib/docx";
import { formatarCnj } from "@/lib/cnj";
import { envServidor } from "@/lib/config/env";
import { anexarParaApi, gravarDocumento, listarDocumentos, type Documento } from "./documentos";
import { timbreDoEscritorio } from "./contratos";
import { executarAgente } from "./ia/executar";
import type { Sessao } from "./sessao";

/**
 * Minutas em seis etapas (skill tjmt-peticoes, Modo C). A IA gera cada etapa; advogado/sócio aprova, devolve ou pula
 * pelas RPCs; a etapa 6 vira versão em Markdown + .docx com timbre, validada por código; a aprovação final passa por
 * `aprovacoes`. Documentos do processo vão à API (PDF inteiro ou páginas extraídas).
 */

export class ErroMinuta extends Error {}

export const ROTULO_STATUS_MINUTA: Record<string, string> = {
  rascunho: "Rascunho",
  em_etapas: "Em etapas",
  redigida: "Redigida",
  em_revisao_ia: "Em revisão",
  aguardando_aprovacao: "Aguardando aprovação",
  devolvida: "Devolvida",
  aprovada: "Aprovada",
  protocolada: "Protocolada",
  arquivada: "Arquivada",
  cancelada: "Cancelada",
};

export interface Minuta {
  id: string;
  escritorio_id: string;
  processo_id: string | null;
  prazo_id: string | null;
  tarefa_id: string | null;
  analise_id: string | null;
  tipo_peca: TipoPeca;
  area: AreaDireito;
  modelo_peca_id: string | null;
  titulo: string;
  modo: "A" | "B" | "C";
  intake: Partial<IntakeMinuta> & { documento_ids?: string[]; comarca?: string | null; vara?: string | null; parteContraria?: string | null };
  status: string;
  etapa_atual: number;
  versao_atual_id: string | null;
  responsavel_id: string | null;
  protocolo_numero: string | null;
  protocolada_em: string | null;
  aprovacao_id: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface Etapa {
  id: string;
  numero: number;
  conteudo_md: string;
  estruturado: Record<string, unknown> | null;
  status: "gerada" | "aprovada" | "devolvida" | "pulada";
  comentarios: string | null;
  aprovada_em: string | null;
  criado_em: string;
}

export interface Versao {
  id: string;
  numero: number;
  autor_tipo: "ia" | "usuario";
  conteudo_md: string;
  documento_id: string | null;
  citacoes: unknown[];
  validacao: Partial<ResultadoValidacao> & { lacunas?: number };
  resumo_alteracoes: string | null;
  criado_em: string;
}

const COLUNAS = "id, escritorio_id, processo_id, prazo_id, tarefa_id, analise_id, tipo_peca, area, modelo_peca_id, titulo, modo, intake, status, etapa_atual, versao_atual_id, responsavel_id, protocolo_numero, protocolada_em, aprovacao_id, criado_em, atualizado_em";

export async function listarMinutas(supabase: SupabaseClient, filtro: { status?: string; processoId?: string } = {}): Promise<(Minuta & { processo_numero: string | null })[]> {
  let q = supabase.from("minutas").select(`${COLUNAS}, processos(numero_cnj_mascara)`).order("atualizado_em", { ascending: false }).limit(200);
  if (filtro.status) q = q.eq("status", filtro.status);
  if (filtro.processoId) q = q.eq("processo_id", filtro.processoId);
  const { data, error } = await q;
  if (error) throw new ErroMinuta(error.message);
  return (data ?? []).map((m) => {
    const rel = (m as unknown as { processos?: { numero_cnj_mascara: string | null } | { numero_cnj_mascara: string | null }[] | null }).processos;
    const numero = Array.isArray(rel) ? rel[0]?.numero_cnj_mascara : rel?.numero_cnj_mascara;
    return { ...(m as unknown as Minuta), processo_numero: numero ?? null };
  });
}

export async function obterMinuta(supabase: SupabaseClient, id: string): Promise<Minuta | null> {
  const { data } = await supabase.from("minutas").select(COLUNAS).eq("id", id).maybeSingle();
  return (data as unknown as Minuta | null) ?? null;
}

export async function listarEtapas(supabase: SupabaseClient, minutaId: string): Promise<Etapa[]> {
  const { data } = await supabase.from("minuta_etapas").select("id, numero, conteudo_md, estruturado, status, comentarios, aprovada_em, criado_em").eq("minuta_id", minutaId).order("numero");
  return (data ?? []) as unknown as Etapa[];
}

export async function listarVersoes(supabase: SupabaseClient, minutaId: string): Promise<Versao[]> {
  const { data } = await supabase.from("minuta_versoes").select("id, numero, autor_tipo, conteudo_md, documento_id, citacoes, validacao, resumo_alteracoes, criado_em").eq("minuta_id", minutaId).order("numero", { ascending: false });
  return (data ?? []) as unknown as Versao[];
}

export interface NovaMinuta {
  processoId: string | null;
  prazoId: string | null;
  tarefaId?: string | null;
  analiseId?: string | null;
  tipoPeca: TipoPeca;
  area: AreaDireito;
  modo: "A" | "B" | "C";
  titulo: string;
  relato: string;
  rascunho: string | null;
  pedidos: string | null;
  urgencia: string | null;
  peculiaridades: string | null;
  parteContraria: string | null;
  comarca: string | null;
  vara: string | null;
  grau: "primeiro" | "segundo";
  documentoIds: string[];
  pontosVarredura?: string[] | null;
}

export async function criarMinuta(sessao: Sessao, d: NovaMinuta): Promise<string> {
  const supabase = await criarClienteServidor();
  const intake = { relato: d.relato, rascunho: d.rascunho, pedidos: d.pedidos, urgencia: d.urgencia, peculiaridades: d.peculiaridades, parteContraria: d.parteContraria, comarca: d.comarca, vara: d.vara, grau: d.grau, documento_ids: d.documentoIds, pontosVarredura: d.pontosVarredura ?? null };
  const { data, error } = await supabase
    .from("minutas")
    .insert({ escritorio_id: sessao.escritorioId, processo_id: d.processoId, prazo_id: d.prazoId, tarefa_id: d.tarefaId ?? null, analise_id: d.analiseId ?? null, tipo_peca: d.tipoPeca, area: d.area, modo: d.modo, titulo: d.titulo, intake, status: "rascunho", etapa_atual: d.modo === "C" ? 1 : 6, responsavel_id: sessao.usuarioId, criado_por: sessao.usuarioId })
    .select("id")
    .single();
  if (error) throw new ErroMinuta(error.message);
  return data.id as string;
}

/** Intake completo: o que a pessoa informou + o que o banco sabe do processo, dos documentos e do prazo. */
export async function montarIntakeDoBanco(supabase: SupabaseClient, sessao: Sessao, m: Minuta): Promise<{ intake: IntakeMinuta; documentos: Documento[] }> {
  const i = m.intake ?? {};
  const [processo, partes, docs, prazo, timbre, membro] = await Promise.all([
    m.processo_id ? supabase.from("processos").select("numero_cnj, comarca_id, orgao_julgador_nome, grau, comarcas:comarca_id(nome)").eq("id", m.processo_id).maybeSingle().then((r) => r.data as { numero_cnj: string; comarca_id: string | null; orgao_julgador_nome: string | null; grau: string | null; comarcas?: { nome: string } | { nome: string }[] | null } | null) : Promise.resolve(null),
    m.processo_id ? supabase.from("processo_partes").select("nome, polo, eh_cliente, documento").eq("processo_id", m.processo_id).then((r) => r.data ?? []) : Promise.resolve([]),
    listarDocumentos(supabase, { processoId: m.processo_id ?? undefined, limite: 100 }).catch(() => [] as Documento[]),
    m.prazo_id ? supabase.from("prazos").select("ato_descricao, data_final").eq("id", m.prazo_id).maybeSingle().then((r) => r.data) : Promise.resolve(null),
    timbreDoEscritorio(supabase, sessao.escritorioId),
    supabase.from("escritorio_membros").select("nome_completo, oab_numero, oab_uf").eq("escritorio_id", sessao.escritorioId).eq("usuario_id", sessao.usuarioId).maybeSingle().then((r) => r.data),
  ]);
  const selecionados = i.documento_ids?.length ? docs.filter((d) => i.documento_ids!.includes(d.id)) : docs;
  const comarcaProc = processo?.comarcas ? (Array.isArray(processo.comarcas) ? processo.comarcas[0]?.nome : processo.comarcas.nome) : null;
  const intake: IntakeMinuta = {
    tipoPeca: m.tipo_peca,
    area: m.area,
    modo: m.modo,
    partes: (partes as { nome: string; polo: string; eh_cliente: boolean; documento: string | null }[]).map((p) => ({ nome: p.nome, polo: p.polo, ehCliente: p.eh_cliente, documento: p.documento })),
    parteContraria: i.parteContraria ?? (partes as { nome: string; eh_cliente: boolean }[]).find((p) => !p.eh_cliente)?.nome ?? null,
    comarca: i.comarca ?? comarcaProc ?? null,
    vara: i.vara ?? processo?.orgao_julgador_nome ?? null,
    grau: (i.grau as "primeiro" | "segundo" | undefined) ?? (processo?.grau === "G2" ? "segundo" : "primeiro"),
    numeroCnj: processo?.numero_cnj ? formatarCnj(processo.numero_cnj) : null,
    relato: i.relato ?? "",
    rascunho: i.rascunho ?? null,
    documentos: selecionados.map((d, k) => ({ numero: k + 1, nome: d.nome, id: d.id, paginas: d.paginas })),
    pedidos: i.pedidos ?? null,
    urgencia: i.urgencia ?? null,
    peculiaridades: i.peculiaridades ?? null,
    prazo: prazo ? { ato: (prazo.ato_descricao as string | null) ?? null, dataFinal: prazo.data_final ? String(prazo.data_final) : null } : null,
    publicacaoTexto: null,
    pontosVarredura: i.pontosVarredura ?? null,
    advogada: { nome: timbre.advogadaNome ?? (membro?.nome_completo as string | undefined) ?? null, oab: timbre.advogadaOab ?? (membro?.oab_numero ? `${membro.oab_numero}` : null), email: timbre.advogadaEmail ?? timbre.email ?? null },
  };
  return { intake, documentos: selecionados };
}

async function anexos(admin: SupabaseClient, documentos: Documento[], max = 4): Promise<DocumentoEntrada[]> {
  const saida: DocumentoEntrada[] = [];
  for (const d of documentos.slice(0, max)) {
    if (d.mime !== "application/pdf" && !d.texto_extraido_em) continue;
    try {
      saida.push(await anexarParaApi(admin, d));
    } catch {
      // documento sem texto e sem acesso ao arquivo: segue sem ele; a etapa marca lacuna
    }
  }
  return saida;
}

/** Gera a etapa N pela IA (as anteriores aprovadas entram como contexto). A etapa 6 vira versão da peça. */
export async function gerarEtapa(sessao: Sessao, minutaId: string, numero: 1 | 2 | 3 | 4 | 5 | 6): Promise<void> {
  const supabase = await criarClienteServidor();
  const admin = criarClienteAdmin();
  const m = await obterMinuta(supabase, minutaId);
  if (!m) throw new ErroMinuta("Minuta não encontrada.");
  if (!["rascunho", "em_etapas", "devolvida", "redigida"].includes(m.status)) throw new ErroMinuta(`Minuta em ${ROTULO_STATUS_MINUTA[m.status] ?? m.status} não aceita nova etapa.`);
  if (numero > m.etapa_atual) throw new ErroMinuta(`A etapa atual é a ${m.etapa_atual}. Aprove ou pule as anteriores.`);
  const { intake, documentos } = await montarIntakeDoBanco(supabase, sessao, m);
  const etapas = await listarEtapas(supabase, minutaId);
  const anteriores = etapas.filter((e) => e.numero < numero && (e.status === "aprovada" || e.status === "pulada"));
  const contexto = anteriores.map((e) => (e.status === "pulada" ? `### Etapa ${e.numero} (${TITULO_ETAPA[e.numero]}): PULADA pela advogada (${e.comentarios ?? "sem motivo"})` : `### Etapa ${e.numero} (${TITULO_ETAPA[e.numero]}), aprovada${e.comentarios ? ` com o comentário: ${e.comentarios}` : ""}\n${e.conteudo_md}`)).join("\n\n");
  const devolvida = etapas.find((e) => e.numero === numero && e.status === "devolvida");
  const usuario = [
    `ETAPA PEDIDA: ${numero} — ${TITULO_ETAPA[numero]}. Produza somente esta etapa.`,
    devolvida ? `A versão anterior desta etapa foi DEVOLVIDA com o comentário: ${devolvida.comentarios}. Refaça atendendo a ele.` : "",
    "",
    `Referências da área (${m.area}):\n${REFERENCIAS[m.area]}`,
    "",
    montarMensagemIntake(intake),
    contexto ? `\n\nETAPAS ANTERIORES APROVADAS\n${contexto}` : "",
  ].filter(Boolean).join("\n");
  const docsApi = await anexos(admin, documentos);
  const env = envServidor();
  let dados: Record<string, unknown>;
  let execucaoId: string | null;
  try {
    const r = await executarAgente(
      { admin, escritorioId: sessao.escritorioId, agente: "peticao", objeto: { tipo: "minuta", id: minutaId }, modelo: numero === 6 ? env.IA_MODELO_PECAS_FORTE : undefined },
      (ia, modelo) => ia.gerarEstruturado({ agente: "peticao", modelo, sistema: SISTEMA_PETICAO, cacheSistema: true, usuario, documentos: docsApi, schema: ESQUEMAS_ETAPAS[numero], maxTokens: numero === 6 ? 32_000 : 16_000, effort: "high" }),
    );
    dados = r.resultado.dados as Record<string, unknown>;
    execucaoId = r.execucaoId;
  } catch (e) {
    if (e instanceof ErroIa) throw new ErroMinuta(e.tipo === "cancelado_teto" ? "Teto mensal de IA atingido." : `A IA não conseguiu gerar a etapa: ${e.message}`);
    throw e;
  }
  const conteudo = String(dados.conteudo_md ?? "");
  const { error } = await supabase.from("minuta_etapas").upsert({ escritorio_id: sessao.escritorioId, minuta_id: minutaId, numero, conteudo_md: conteudo, estruturado: dados, ia_execucao_id: execucaoId, status: "gerada", comentarios: null, aprovada_por: null, aprovada_em: null }, { onConflict: "minuta_id,numero" });
  if (error) throw new ErroMinuta(error.message);
  if (m.status === "rascunho") await supabase.from("minutas").update({ status: "em_etapas" }).eq("id", minutaId);
  if (numero === 6) await criarVersao(sessao, m, conteudo, { autorTipo: "ia", iaExecucaoId: execucaoId, estruturado: dados as unknown as Etapa6, intake, documentos });
}

/** Alias mantido para as actions: a geração já anexa os documentos do processo (PDF inteiro ou páginas). */
export const gerarEtapaComDocumentos = gerarEtapa;

async function criarVersao(sessao: Sessao, m: Minuta, md: string, o: { autorTipo: "ia" | "usuario"; iaExecucaoId: string | null; estruturado: Etapa6 | null; intake: IntakeMinuta; documentos: Documento[]; resumo?: string }): Promise<string> {
  const supabase = await criarClienteServidor();
  const citacoesConfirmadas = (o.estruturado?.citacoes_jurisprudencia ?? []).filter((c) => c.confirmada_na_base && c.id_base).map((c) => c.id_base as string);
  let tempestivo: boolean | null = null;
  if (o.intake.prazo?.dataFinal) tempestivo = o.intake.prazo.dataFinal >= new Date().toISOString().slice(0, 10);
  const validacao = validarPeca(md, { numeroCnjProcesso: o.intake.numeroCnj, documentosExistentes: o.intake.documentos.map((d) => d.numero), citacoesConfirmadas, grau: o.intake.grau, tipoPeca: m.tipo_peca, tempestivo });
  const { data: ultima } = await supabase.from("minuta_versoes").select("numero").eq("minuta_id", m.id).order("numero", { ascending: false }).limit(1).maybeSingle();
  const numero = Number(ultima?.numero ?? 0) + 1;
  const timbre = await timbreDoEscritorio(supabase, sessao.escritorioId);
  let documentoId: string | null = null;
  try {
    const bytes = await markdownParaDocx(md, timbre, { titulo: m.titulo });
    const doc = await gravarDocumento(sessao.escritorioId, sessao.usuarioId, { bytes, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", nome: `${m.titulo.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 80)} v${numero}.docx`, tipo: "peca", processoId: m.processo_id, clienteId: null, origem: "gerado", inserirCom: supabase });
    documentoId = doc.id;
  } catch {
    // sem Storage (CI) a versão fica só em Markdown
  }
  const { data, error } = await supabase
    .from("minuta_versoes")
    .insert({ escritorio_id: sessao.escritorioId, minuta_id: m.id, numero, autor_tipo: o.autorTipo, autor_id: sessao.usuarioId, ia_execucao_id: o.iaExecucaoId, conteudo_md: md, documento_id: documentoId, citacoes: o.estruturado?.citacoes_jurisprudencia ?? [], validacao, resumo_alteracoes: o.resumo ?? (o.autorTipo === "ia" ? "redação pela IA (etapa 6)" : "edição da advogada") })
    .select("id")
    .single();
  if (error) throw new ErroMinuta(error.message);
  await supabase.from("minutas").update({ versao_atual_id: data.id, status: "redigida", etapa_atual: 6 }).eq("id", m.id);
  return data.id as string;
}

/** A advogada edita o texto no painel: nova versão (autor usuário) com validação e .docx. */
export async function novaVersaoManual(sessao: Sessao, minutaId: string, md: string, resumo: string | null): Promise<string> {
  const supabase = await criarClienteServidor();
  const m = await obterMinuta(supabase, minutaId);
  if (!m) throw new ErroMinuta("Minuta não encontrada.");
  if (!["redigida", "devolvida", "em_revisao_ia", "aprovada"].includes(m.status)) throw new ErroMinuta("Só minuta redigida aceita nova versão.");
  const { intake, documentos } = await montarIntakeDoBanco(supabase, sessao, m);
  return criarVersao(sessao, m, md, { autorTipo: "usuario", iaExecucaoId: null, estruturado: null, intake, documentos, resumo: resumo ?? undefined });
}

export async function aprovarEtapa(minutaId: string, numero: number, comentario: string | null): Promise<void> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("minuta_aprovar_etapa", { p_minuta: minutaId, p_numero: numero, p_comentario: comentario });
  if (error) throw new ErroMinuta(error.message);
}
export async function devolverEtapa(minutaId: string, numero: number, comentario: string): Promise<void> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("minuta_devolver_etapa", { p_minuta: minutaId, p_numero: numero, p_comentario: comentario });
  if (error) throw new ErroMinuta(error.message);
}
export async function pularEtapas(minutaId: string, ate: number, motivo: string): Promise<void> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("minuta_pular_etapas", { p_minuta: minutaId, p_ate: ate, p_motivo: motivo });
  if (error) throw new ErroMinuta(error.message);
}
export async function enviarMinutaParaAprovacao(minutaId: string, comentario: string | null): Promise<string> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("minuta_enviar_aprovacao", { p_minuta: minutaId, p_comentario: comentario });
  if (error) throw new ErroMinuta(error.message);
  return data as string;
}
export async function marcarProtocolada(minutaId: string, numeroProtocolo: string | null): Promise<void> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("minuta_marcar_protocolada", { p_minuta: minutaId, p_numero_protocolo: numeroProtocolo });
  if (error) throw new ErroMinuta(error.message);
}
export async function arquivarMinuta(sessao: Sessao, minutaId: string, status: "arquivada" | "cancelada"): Promise<void> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("minutas").update({ status }).eq("id", minutaId).eq("escritorio_id", sessao.escritorioId);
  if (error) throw new ErroMinuta(error.message);
}

export function textoDelimitadoParaIa(rotulo: string, texto: string): string {
  return delimitarDado(rotulo, texto);
}
