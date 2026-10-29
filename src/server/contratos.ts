import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { delimitarDado, ErroIa } from "@/lib/ia";
import { SISTEMA as SISTEMA_HONORARIOS } from "@/lib/ia/prompts/honorarios.v1";
import { DiagnosticoHonorariosSchema, type DiagnosticoHonorarios } from "@/lib/ia/schemas/honorarios";
import { calcularHonorarios, FATORES_PADRAO, sugerirModalidade, validarConfirmacao, type FatoresComplexidade, type Modalidade, type ResultadoHonorarios, type SugestaoModalidade, type TabelaHonorarios } from "@/lib/honorarios";
import { contratoHonorariosMarkdown, dataPorExtenso, declaracaoHipossuficienciaMarkdown, markdownParaDocx, PODERES_POR_MATERIA, procuracaoMarkdown, TIMBRE_VAZIO, verificarMarcadores, type DadosContrato, type QualificacaoCliente, type Timbre } from "@/lib/docx";
import { hojeNoFuso } from "@/lib/prazos";
import { gravarDocumento } from "./documentos";
import { executarAgente } from "./ia/executar";
import type { Sessao } from "./sessao";

/**
 * Entrada do caso (skill contratacao-e-honorarios): a IA diagnostica, o código calcula e sugere a modalidade,
 * a advogada confirma valor e modalidade (parada obrigatória), o sistema gera os três .docx com timbre, o contrato
 * entra em aprovações e, aprovado, pode ser marcado como assinado (gera parcelas).
 */

export class ErroContrato extends Error {}

export const ROTULO_STATUS_CONTRATO: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_confirmacao: "Aguardando confirmação",
  confirmado: "Valor confirmado",
  aguardando_aprovacao: "Aguardando aprovação",
  aprovado: "Aprovado",
  assinado: "Assinado",
  cancelado: "Cancelado",
};

export interface Contrato {
  id: string;
  escritorio_id: string;
  cliente_id: string;
  processo_id: string | null;
  demanda_em_curso: boolean;
  via: "judicial" | "extrajudicial";
  polo: string | null;
  relato: string | null;
  objeto: string | null;
  natureza: string | null;
  fase: string | null;
  parte_contraria: string | null;
  juizo: string | null;
  complexidade: "baixa" | "media" | "alta" | null;
  complexidade_justificativa: string | null;
  proveito_economico: number | string | null;
  rubricas: string[];
  cautelar_satisfativa: boolean;
  diagnostico: DiagnosticoHonorarios | (Record<string, unknown> & { ajustes_aprovacao?: unknown }) | null;
  calculo: (ResultadoHonorarios & { sugestao?: SugestaoModalidade }) | null;
  tabela_honorarios_id: string | null;
  modalidade: Modalidade | null;
  valor_fixo: number | string | null;
  percentual_exito: number | string | null;
  parcelas: number | null;
  primeira_parcela_em: string | null;
  dia_vencimento: number | null;
  gratuidade: boolean;
  poderes_especiais: string[];
  contatos_procuracao: "cliente" | "escritorio" | "nenhum";
  qualificacao: Partial<QualificacaoCliente> & { foro_comarca?: string; orgaos_do_caso?: string; fato_essencial?: string };
  foro_comarca: string | null;
  documento_contrato_id: string | null;
  documento_procuracao_id: string | null;
  documento_declaracao_id: string | null;
  aprovacao_id: string | null;
  status: string;
  confirmado_em: string | null;
  assinado_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface Parcela {
  id: string;
  numero: number;
  vencimento: string;
  valor: number | string;
  status: string;
  paga_em: string | null;
  observacao: string | null;
}

const COLUNAS = "id, escritorio_id, cliente_id, processo_id, demanda_em_curso, via, polo, relato, objeto, natureza, fase, parte_contraria, juizo, complexidade, complexidade_justificativa, proveito_economico, rubricas, cautelar_satisfativa, diagnostico, calculo, tabela_honorarios_id, modalidade, valor_fixo, percentual_exito, parcelas, primeira_parcela_em, dia_vencimento, gratuidade, poderes_especiais, contatos_procuracao, qualificacao, foro_comarca, documento_contrato_id, documento_procuracao_id, documento_declaracao_id, aprovacao_id, status, confirmado_em, assinado_em, criado_em, atualizado_em";

export async function listarContratos(supabase: SupabaseClient, filtro: { status?: string; clienteId?: string } = {}): Promise<(Contrato & { cliente_nome: string | null })[]> {
  let q = supabase.from("contratos").select(`${COLUNAS}, clientes(nome)`).order("atualizado_em", { ascending: false }).limit(200);
  if (filtro.status) q = q.eq("status", filtro.status);
  if (filtro.clienteId) q = q.eq("cliente_id", filtro.clienteId);
  const { data, error } = await q;
  if (error) throw new ErroContrato(error.message);
  return (data ?? []).map((c) => {
    const rel = (c as unknown as { clientes?: { nome: string } | { nome: string }[] | null }).clientes;
    const nome = Array.isArray(rel) ? rel[0]?.nome : rel?.nome;
    return { ...(c as unknown as Contrato), cliente_nome: nome ?? null };
  });
}

export async function obterContrato(supabase: SupabaseClient, id: string): Promise<Contrato | null> {
  const { data } = await supabase.from("contratos").select(COLUNAS).eq("id", id).maybeSingle();
  return (data as unknown as Contrato | null) ?? null;
}

export async function listarParcelas(supabase: SupabaseClient, contratoId: string): Promise<Parcela[]> {
  const { data } = await supabase.from("contrato_parcelas").select("id, numero, vencimento, valor, status, paga_em, observacao").eq("contrato_id", contratoId).order("numero");
  return (data ?? []) as unknown as Parcela[];
}

/** Tabela OAB vigente (ref) para a UF e a data, com os itens. */
export async function tabelaVigente(supabase: SupabaseClient, uf = "MT", data?: string): Promise<TabelaHonorarios | null> {
  const { data: id } = await supabase.rpc("tabela_honorarios_vigente", { p_uf: uf, p_data: data ?? new Date().toISOString().slice(0, 10) }).then((r) => ({ data: r.data as string | null }));
  if (!id) return null;
  const [{ data: t }, { data: itens }] = await Promise.all([
    supabase.schema("ref").from("tabelas_honorarios").select("id, uf, vigencia_inicio, valor_urh").eq("id", id).maybeSingle(),
    supabase.schema("ref").from("tabela_honorarios_itens").select("codigo, secao, item, multiplo_urh, percentual, minimo_urh, observacao").eq("tabela_id", id).order("secao").order("item"),
  ]);
  if (!t) return null;
  return {
    id: t.id as string,
    uf: t.uf as string,
    vigenciaInicio: String(t.vigencia_inicio),
    valorUrh: Number(t.valor_urh),
    itens: (itens ?? []).map((i) => ({ codigo: i.codigo as string, secao: i.secao as string, item: i.item as string, multiploUrh: i.multiplo_urh === null ? null : Number(i.multiplo_urh), percentual: i.percentual === null ? null : Number(i.percentual), minimoUrh: i.minimo_urh === null ? null : Number(i.minimo_urh), observacao: (i.observacao as string | null) ?? undefined })),
  };
}

export async function listarTabelas(supabase: SupabaseClient, uf = "MT"): Promise<{ id: string; vigencia_inicio: string; valor_urh: number; itens: number }[]> {
  const { data } = await supabase.schema("ref").from("tabelas_honorarios").select("id, vigencia_inicio, valor_urh, tabela_honorarios_itens(count)").eq("uf", uf).order("vigencia_inicio", { ascending: false });
  return (data ?? []).map((t) => ({ id: t.id as string, vigencia_inicio: String(t.vigencia_inicio), valor_urh: Number(t.valor_urh), itens: Number(((t as { tabela_honorarios_itens?: { count: number }[] }).tabela_honorarios_itens?.[0]?.count) ?? 0) }));
}

/** Sócio cadastra a tabela do ano: nova vigência e URH; os itens são copiados da tabela anterior (múltiplos raramente mudam). */
export async function cadastrarTabela(sessao: Sessao, dados: { vigenciaInicio: string; valorUrh: number; fonteUrl: string | null; uf?: string }): Promise<void> {
  if (sessao.papel !== "socio") throw new ErroContrato("Apenas sócio cadastra a tabela da OAB.");
  const admin = criarClienteAdmin();
  const uf = dados.uf ?? "MT";
  const anterior = await tabelaVigente(admin, uf, dados.vigenciaInicio);
  const { data: nova, error } = await admin.schema("ref").from("tabelas_honorarios").insert({ uf, vigencia_inicio: dados.vigenciaInicio, valor_urh: dados.valorUrh, fonte_url: dados.fonteUrl, importada_por: sessao.usuarioId }).select("id").single();
  if (error) throw new ErroContrato(error.message.includes("duplicate") ? "Já existe tabela com essa vigência." : error.message);
  if (anterior) {
    const itens = anterior.itens.map((i) => ({ tabela_id: nova.id as string, codigo: i.codigo, secao: i.secao, item: i.item, multiplo_urh: i.multiploUrh, percentual: i.percentual, minimo_urh: i.minimoUrh, observacao: i.observacao ?? null }));
    const { error: erroItens } = await admin.schema("ref").from("tabela_honorarios_itens").insert(itens);
    if (erroItens) throw new ErroContrato(erroItens.message);
  }
}

export async function fatoresDoEscritorio(supabase: SupabaseClient, escritorioId: string): Promise<FatoresComplexidade> {
  const { data } = await supabase.from("escritorio_configuracoes").select("valor").eq("escritorio_id", escritorioId).eq("chave", "honorarios.fatores").maybeSingle();
  const v = (data?.valor ?? {}) as Partial<FatoresComplexidade>;
  return { baixa: Number(v.baixa ?? FATORES_PADRAO.baixa), media: Number(v.media ?? FATORES_PADRAO.media), alta: Number(v.alta ?? FATORES_PADRAO.alta) };
}

export async function salvarFatores(sessao: Sessao, fatores: FatoresComplexidade): Promise<void> {
  if (sessao.papel !== "socio") throw new ErroContrato("Apenas sócio altera os fatores.");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("escritorio_configuracoes").upsert({ escritorio_id: sessao.escritorioId, chave: "honorarios.fatores", valor: fatores, atualizado_por: sessao.usuarioId }, { onConflict: "escritorio_id,chave" });
  if (error) throw new ErroContrato(error.message);
}

export async function timbreDoEscritorio(supabase: SupabaseClient, escritorioId: string): Promise<Timbre> {
  const [{ data: esc }, { data: cfg }] = await Promise.all([
    supabase.from("escritorios").select("nome, razao_social, cnpj").eq("id", escritorioId).maybeSingle(),
    supabase.from("escritorio_configuracoes").select("valor").eq("escritorio_id", escritorioId).eq("chave", "documentos.timbre").maybeSingle(),
  ]);
  const v = (cfg?.valor ?? {}) as Partial<Timbre>;
  return { ...TIMBRE_VAZIO, ...v, nome: (esc?.nome as string | undefined) ?? v.nome ?? "", razaoSocial: (esc?.razao_social as string | null | undefined) ?? v.razaoSocial ?? null, cnpj: (esc?.cnpj as string | null | undefined) ?? v.cnpj ?? null };
}

export async function salvarTimbre(sessao: Sessao, timbre: Partial<Timbre>): Promise<void> {
  if (sessao.papel !== "socio") throw new ErroContrato("Apenas sócio altera o timbre.");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("escritorio_configuracoes").upsert({ escritorio_id: sessao.escritorioId, chave: "documentos.timbre", valor: timbre, atualizado_por: sessao.usuarioId }, { onConflict: "escritorio_id,chave" });
  if (error) throw new ErroContrato(error.message);
}

export async function criarRascunho(sessao: Sessao, d: { clienteId: string; processoId: string | null; demandaEmCurso: boolean; via: "judicial" | "extrajudicial"; polo: string; relato: string }): Promise<string> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("contratos").insert({ escritorio_id: sessao.escritorioId, cliente_id: d.clienteId, processo_id: d.processoId, demanda_em_curso: d.demandaEmCurso, via: d.via, polo: d.polo, relato: d.relato, criado_por: sessao.usuarioId, status: "rascunho" }).select("id").single();
  if (error) throw new ErroContrato(error.message);
  return data.id as string;
}

/** Etapa 1 (IA): diagnóstico; grava rubricas, complexidade, proveito e objeto no contrato e calcula em seguida. */
export async function diagnosticar(sessao: Sessao, contratoId: string): Promise<DiagnosticoHonorarios> {
  const supabase = await criarClienteServidor();
  const admin = criarClienteAdmin();
  const c = await obterContrato(supabase, contratoId);
  if (!c) throw new ErroContrato("Contrato não encontrado.");
  if (!["rascunho", "aguardando_confirmacao"].includes(c.status)) throw new ErroContrato("O diagnóstico só pode ser refeito em rascunho.");
  const [{ data: cliente }, processo] = await Promise.all([
    supabase.from("clientes").select("nome, tipo_pessoa, cpf_cnpj, endereco").eq("id", c.cliente_id).maybeSingle(),
    c.processo_id ? supabase.from("processos").select("numero_cnj_mascara, classe_nome, orgao_julgador_nome, valor_causa, competencia, fase_id").eq("id", c.processo_id).maybeSingle().then((r) => r.data) : Promise.resolve(null),
  ]);
  const cabecalho = [
    `Demanda em curso: ${c.demanda_em_curso ? "sim" : "não (nós iniciaremos)"} · Via: ${c.via} · Polo que representaremos: ${c.polo ?? "(não informado)"}`,
    `Cliente: ${cliente?.nome ?? "?"} (${cliente?.tipo_pessoa === "juridica" ? "pessoa jurídica" : "pessoa física"})`,
    processo ? `Processo: ${processo.numero_cnj_mascara ?? ""} · ${processo.classe_nome ?? ""} · ${processo.orgao_julgador_nome ?? ""} · valor da causa ${processo.valor_causa ?? "?"} · competência ${processo.competencia ?? "?"}` : "Sem processo cadastrado.",
  ].join("\n");
  let diagnostico: DiagnosticoHonorarios;
  let execucaoId: string | null;
  try {
    const r = await executarAgente({ admin, escritorioId: sessao.escritorioId, agente: "honorarios", objeto: { tipo: "contrato", id: contratoId } }, (ia, modelo) =>
      ia.gerarEstruturado({ agente: "honorarios", modelo, sistema: SISTEMA_HONORARIOS, cacheSistema: true, usuario: `${cabecalho}\n\n${delimitarDado("relato_do_caso", (c.relato ?? "").slice(0, 20_000))}`, schema: DiagnosticoHonorariosSchema, maxTokens: 4096, effort: "medium" }),
    );
    diagnostico = r.resultado.dados;
    execucaoId = r.execucaoId;
  } catch (e) {
    if (e instanceof ErroIa) throw new ErroContrato(e.tipo === "cancelado_teto" ? "Teto mensal de IA atingido." : `A IA não conseguiu diagnosticar: ${e.message}`);
    throw e;
  }
  const { error } = await supabase
    .from("contratos")
    .update({
      diagnostico,
      objeto: diagnostico.objeto,
      natureza: diagnostico.natureza,
      fase: diagnostico.fase,
      via: diagnostico.via,
      parte_contraria: diagnostico.parte_contraria,
      complexidade: diagnostico.complexidade,
      complexidade_justificativa: diagnostico.complexidade_justificativa,
      proveito_economico: diagnostico.proveito_estimado,
      rubricas: diagnostico.rubricas_sugeridas,
      cautelar_satisfativa: diagnostico.cautelar_satisfativa,
      poderes_especiais: diagnostico.poderes_especiais,
      ia_execucao_id: execucaoId,
      status: "aguardando_confirmacao",
    })
    .eq("id", contratoId);
  if (error) throw new ErroContrato(error.message);
  await calcular(sessao, contratoId);
  return diagnostico;
}

/** Etapas 2 e 3 (código): cálculo em três camadas e sugestão de modalidade; grava em contratos.calculo. */
export async function calcular(sessao: Sessao, contratoId: string, ajustes: { rubricas?: string[]; proveito?: number | null; complexidade?: "baixa" | "media" | "alta"; cautelarSatisfativa?: boolean; parcelas?: number | null } = {}): Promise<ResultadoHonorarios & { sugestao: SugestaoModalidade }> {
  const supabase = await criarClienteServidor();
  const c = await obterContrato(supabase, contratoId);
  if (!c) throw new ErroContrato("Contrato não encontrado.");
  const [tabela, fatores, { data: esc }] = await Promise.all([tabelaVigente(supabase, "MT"), fatoresDoEscritorio(supabase, sessao.escritorioId), supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).maybeSingle()]);
  if (!tabela) throw new ErroContrato("Nenhuma Tabela OAB/MT cadastrada. Cadastre em Configurações → Honorários.");
  const hoje = hojeNoFuso((esc?.timezone as string | undefined) ?? "America/Cuiaba");
  const rubricas = ajustes.rubricas ?? c.rubricas;
  const proveito = ajustes.proveito !== undefined ? ajustes.proveito : c.proveito_economico === null ? null : Number(c.proveito_economico);
  const complexidade = ajustes.complexidade ?? c.complexidade ?? "media";
  const cautelar = ajustes.cautelarSatisfativa ?? c.cautelar_satisfativa;
  const resultado = calcularHonorarios({ rubricas, proveitoEconomico: proveito, complexidade, cautelarSatisfativa: cautelar, fatores, parcelas: ajustes.parcelas ?? c.parcelas, hoje }, tabela);
  const d = c.diagnostico as DiagnosticoHonorarios | null;
  const sugestao = sugerirModalidade({
    proveito: proveito === null ? "inestimavel" : proveito >= 100_000 ? "alto" : proveito >= 20_000 ? "medio" : "baixo",
    tese: d?.tese ?? "desconhecida",
    liquidezCliente: "desconhecida",
    trabalho: d?.trabalho ?? "medio",
    clienteNovo: true,
    tituloFormado: d?.titulo_formado ?? false,
  });
  const calculo = { ...resultado, sugestao };
  const { error } = await supabase.from("contratos").update({ calculo, rubricas, proveito_economico: proveito, complexidade, cautelar_satisfativa: cautelar, tabela_honorarios_id: tabela.id }).eq("id", contratoId);
  if (error) throw new ErroContrato(error.message);
  return calculo;
}

/** Parada obrigatória: a advogada confirma valor E modalidade. Valida contra o piso e o teto antes da RPC. */
export async function confirmarValor(sessao: Sessao, contratoId: string, c: { modalidade: Modalidade; valorFixo: number | null; percentual: number | null; parcelas: number | null; primeiraParcelaEm: string | null; diaVencimento: number | null; forcar?: boolean }): Promise<{ alertas: string[] }> {
  const supabase = await criarClienteServidor();
  const contrato = await obterContrato(supabase, contratoId);
  if (!contrato?.calculo) throw new ErroContrato("Faça o diagnóstico e o cálculo antes de confirmar.");
  const v = validarConfirmacao({ modalidade: c.modalidade, valorFixo: c.valorFixo, percentual: c.percentual }, contrato.calculo);
  if (!v.ok && !c.forcar) throw new ErroContrato(v.erros.join(" "));
  const { error } = await supabase.rpc("contrato_confirmar_valor", { p_id: contratoId, p_modalidade: c.modalidade, p_valor_fixo: c.valorFixo, p_percentual: c.percentual, p_parcelas: c.parcelas, p_primeira_parcela_em: c.primeiraParcelaEm, p_dia_vencimento: c.diaVencimento });
  if (error) throw new ErroContrato(error.message);
  return { alertas: v.alertas };
}

/** Dados complementares (qualificação, gratuidade, foro, poderes, contatos da procuração) antes dos documentos. */
export async function atualizarDadosDocumentos(sessao: Sessao, contratoId: string, d: { qualificacao: Partial<QualificacaoCliente> & { foro_comarca?: string; orgaos_do_caso?: string; fato_essencial?: string; juizo?: string }; gratuidade: boolean; poderes: string[]; contatosProcuracao: "cliente" | "escritorio" | "nenhum"; foroComarca: string | null; juizo: string | null; parteContraria: string | null }): Promise<void> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("contratos").update({ qualificacao: d.qualificacao, gratuidade: d.gratuidade, poderes_especiais: d.poderes, contatos_procuracao: d.contatosProcuracao, foro_comarca: d.foroComarca, juizo: d.juizo, parte_contraria: d.parteContraria }).eq("id", contratoId);
  if (error) throw new ErroContrato(error.message);
}

/** Etapa 4: gera contrato, procuração e (se gratuidade) declaração em .docx, grava no Storage e no contrato. */
export async function gerarDocumentos(sessao: Sessao, contratoId: string): Promise<{ pendentes: string[] }> {
  const supabase = await criarClienteServidor();
  const c = await obterContrato(supabase, contratoId);
  if (!c) throw new ErroContrato("Contrato não encontrado.");
  if (c.status !== "confirmado" && c.status !== "aguardando_aprovacao" && c.status !== "aprovado") throw new ErroContrato("Confirme valor e modalidade antes de gerar os documentos.");
  if (!c.modalidade) throw new ErroContrato("Modalidade não confirmada.");
  const [{ data: cliente }, timbre, processo] = await Promise.all([
    supabase.from("clientes").select("nome, tipo_pessoa, cpf_cnpj, email, telefone_e164, endereco").eq("id", c.cliente_id).maybeSingle(),
    timbreDoEscritorio(supabase, sessao.escritorioId),
    c.processo_id ? supabase.from("processos").select("numero_cnj_mascara, orgao_julgador_nome").eq("id", c.processo_id).maybeSingle().then((r) => r.data) : Promise.resolve(null),
  ]);
  if (!cliente) throw new ErroContrato("Cliente não encontrado.");
  const end = (cliente.endereco ?? {}) as Record<string, string | undefined>;
  const q = c.qualificacao ?? {};
  const qualificacao: QualificacaoCliente = {
    tipoPessoa: (cliente.tipo_pessoa as "fisica" | "juridica") ?? "fisica",
    nome: cliente.nome as string,
    nacionalidade: q.nacionalidade ?? (cliente.tipo_pessoa === "fisica" ? "brasileiro(a)" : null),
    estadoCivil: q.estadoCivil ?? null,
    profissao: q.profissao ?? null,
    cpfCnpj: (cliente.cpf_cnpj as string | null) ?? null,
    logradouro: q.logradouro ?? end.logradouro ?? null,
    numero: q.numero ?? end.numero ?? null,
    complemento: q.complemento ?? end.complemento ?? null,
    bairro: q.bairro ?? end.bairro ?? null,
    cidade: q.cidade ?? end.cidade ?? null,
    uf: q.uf ?? end.uf ?? null,
    cep: q.cep ?? end.cep ?? null,
    email: (cliente.email as string | null) ?? null,
    telefone: (cliente.telefone_e164 as string | null) ?? null,
    representante: q.representante ?? null,
    representanteQualificacao: q.representanteQualificacao ?? null,
    instrumentoRepresentacao: q.instrumentoRepresentacao ?? null,
  };
  const d = c.diagnostico as DiagnosticoHonorarios | null;
  const calc = c.calculo;
  const valorFixo = c.valor_fixo === null ? null : Number(c.valor_fixo);
  const dados: DadosContrato = {
    timbre,
    cliente: qualificacao,
    objeto: {
      atuacao: c.demanda_em_curso ? "acompanhamento" : c.polo && /r[ée]u|requerid|executad/i.test(c.polo) ? "defesa" : "propositura e acompanhamento",
      tipoDemanda: d?.tipo_demanda ?? c.objeto ?? "",
      parteContraria: c.parte_contraria,
      processoCnj: (processo?.numero_cnj_mascara as string | null | undefined) ?? null,
      juizo: c.juizo ?? (processo?.orgao_julgador_nome as string | null | undefined) ?? null,
      pedidos: d?.pedidos ?? [],
      exclusoes: null,
    },
    honorarios: {
      modalidade: c.modalidade,
      valorFixo,
      percentual: c.percentual_exito === null ? null : Number(c.percentual_exito),
      parcelas: c.parcelas,
      primeiraParcelaEm: c.primeira_parcela_em,
      diaVencimento: c.dia_vencimento,
      urhEquivalente: valorFixo !== null && calc?.valorUrh ? Math.round((valorFixo / calc.valorUrh) * 100) / 100 : null,
      valorUrh: calc?.valorUrh ?? null,
      abaterEntrada: false,
      descontosLegais: d?.natureza === "servidor_publico" || d?.natureza === "fazenda_publica" ? "contribuição previdenciária e imposto de renda retido na fonte, se houver" : null,
      exclusoesBase: [],
      reajuste: "pela variação da URH da Tabela de Honorários da OAB/MT",
    },
    gratuidade: c.gratuidade,
    comarcaForo: c.foro_comarca ?? qualificacao.cidade,
    comarcaSede: timbre.cidade,
    fatoEssencialDeclarado: q.fato_essencial ?? null,
    instrumentoDestaque: d?.natureza === "fazenda_publica" || d?.natureza === "servidor_publico" ? "RPV ou precatório" : "alvará",
    dataAssinatura: null,
  };
  const hoje = new Date().toISOString().slice(0, 10);
  const mdContrato = contratoHonorariosMarkdown(dados);
  const mdProcuracao = procuracaoMarkdown({ timbre, cliente: qualificacao, contatos: c.contatos_procuracao, orgaosDoCaso: q.orgaos_do_caso ?? null, poderesEspecificos: c.poderes_especiais.map((p) => PODERES_POR_MATERIA[p]?.texto).filter((t): t is string => Boolean(t)), dataPorExtenso: dataPorExtenso(hoje) });
  const mdDeclaracao = c.gratuidade && qualificacao.tipoPessoa === "fisica" ? declaracaoHipossuficienciaMarkdown({ cliente: qualificacao, comarca: c.foro_comarca ?? qualificacao.cidade, uf: qualificacao.uf }) : null;
  const pendentes = [...verificarMarcadores(mdContrato), ...verificarMarcadores(mdProcuracao), ...(mdDeclaracao ? verificarMarcadores(mdDeclaracao) : [])].map((p) => p.texto);

  const sobrenome = (qualificacao.nome.trim().split(/\s+/).pop() ?? "cliente").replace(/[^\p{L}\p{N}]/gu, "");
  const gravar = async (md: string, nome: string, tipo: string) => {
    const bytes = await markdownParaDocx(md, timbre, { titulo: nome });
    const doc = await gravarDocumento(sessao.escritorioId, sessao.usuarioId, { bytes, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", nome, tipo, processoId: c.processo_id, clienteId: c.cliente_id, origem: "gerado", inserirCom: supabase });
    return doc.id;
  };
  const [idContrato, idProcuracao, idDeclaracao] = await Promise.all([
    gravar(mdContrato, `Contrato_Honorarios_${sobrenome}.docx`, "contrato"),
    gravar(mdProcuracao, `Procuracao_${sobrenome}.docx`, "procuracao"),
    mdDeclaracao ? gravar(mdDeclaracao, `Declaracao_Hipossuficiencia_${sobrenome}.docx`, "declaracao") : Promise.resolve(null),
  ]);
  const { error } = await supabase.from("contratos").update({ documento_contrato_id: idContrato, documento_procuracao_id: idProcuracao, documento_declaracao_id: idDeclaracao, diagnostico: { ...(c.diagnostico ?? {}), documentos_markdown: { contrato: mdContrato, procuracao: mdProcuracao, declaracao: mdDeclaracao }, marcadores_pendentes: pendentes } }).eq("id", contratoId);
  if (error) throw new ErroContrato(error.message);
  return { pendentes: [...new Set(pendentes)] };
}

export async function enviarParaAprovacao(contratoId: string): Promise<string> {
  const supabase = await criarClienteServidor();
  const c = await obterContrato(supabase, contratoId);
  const pendentes = ((c?.diagnostico as { marcadores_pendentes?: string[] } | null)?.marcadores_pendentes ?? []) as string[];
  if (pendentes.length) throw new ErroContrato(`Há ${pendentes.length} lacuna(s) nos documentos; preencha os dados e gere de novo.`);
  const { data, error } = await supabase.rpc("contrato_enviar_aprovacao", { p_id: contratoId });
  if (error) throw new ErroContrato(error.message);
  return data as string;
}

export async function registrarAssinatura(contratoId: string, assinadoEm: string): Promise<void> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("contrato_registrar_assinatura", { p_id: contratoId, p_assinado_em: assinadoEm });
  if (error) throw new ErroContrato(error.message);
}

export async function marcarParcela(parcelaId: string, status: "paga" | "pendente" | "cancelada", pagaEm: string | null, observacao: string | null): Promise<void> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("contrato_parcela_marcar", { p_id: parcelaId, p_status: status, p_paga_em: pagaEm, p_observacao: observacao });
  if (error) throw new ErroContrato(error.message);
}

export async function cancelarContrato(contratoId: string, motivo: string): Promise<void> {
  const supabase = await criarClienteServidor();
  const admin = criarClienteAdmin();
  const c = await obterContrato(supabase, contratoId);
  if (!c) throw new ErroContrato("Contrato não encontrado.");
  if (["assinado"].includes(c.status)) throw new ErroContrato("Contrato assinado não é cancelado por aqui: registre um aditivo.");
  const { error } = await admin.from("contratos").update({ status: "cancelado", cancelado_motivo: motivo }).eq("id", contratoId).eq("escritorio_id", c.escritorio_id);
  if (error) throw new ErroContrato(error.message);
}
