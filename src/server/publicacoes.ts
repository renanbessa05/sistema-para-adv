import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { ClassificacaoPublicacaoSchema } from "@/lib/ia/schemas/classificacao";
import { sugerirPrazo } from "./prazos";

/**
 * Consultas de publicações para o painel. Sempre com o cliente do usuário (RLS) e lista explícita de colunas:
 * `texto` e `payload_bruto` não têm privilégio de leitura; o texto só sai pela RPC `publicacao_texto`.
 */

export const STATUS_PUBLICACAO = ["nova", "classificada", "vinculada", "sem_processo", "com_prazo_sugerido", "sem_prazo", "tratada", "ignorada", "duplicada", "arquivada"] as const;
export type StatusPublicacao = (typeof STATUS_PUBLICACAO)[number];

/** Status que ainda pedem ação humana ou do sistema (caixa de entrada). */
export const STATUS_PENDENTES: StatusPublicacao[] = ["nova", "classificada", "vinculada", "sem_processo", "com_prazo_sugerido", "sem_prazo"];

export const FONTES_PUBLICACAO = ["djen", "pje_manual", "email_manual", "datajud", "pje_extensao"] as const;

export const POR_PAGINA = 50;

const COLUNAS_LISTA = "id, fonte, numero_cnj, numero_processo_texto, processo_id, tipo, status, data_disponibilizacao, data_publicacao, resumo_ia, sugere_sigilo, revisar_classificacao, confianca_ia, cancelada";

const COLUNAS_DETALHE =
  "id, escritorio_id, fonte, id_externo, hash_djen, tribunal_id, numero_cnj, numero_processo_texto, processo_id, vinculo_tipo, motivo_nao_e_nosso, tipo_origem, tipo_documento, tipo, tipo_classificado_por, orgao, classe, meio, data_disponibilizacao, data_publicacao, link, destinatarios, destinatario_advogados, resumo_ia, sugere_sigilo, status, tratada_por, tratada_em, motivo_tratamento, publicacao_anterior_id, cancelada, motivo_cancelamento, data_cancelamento, classificacao, confianca_ia, revisar_classificacao, criado_em, atualizado_em";

export interface ProcessoResumo {
  id: string;
  numero_cnj_mascara: string | null;
  responsavel_id: string | null;
  segredo_justica?: boolean | null;
  orgao_julgador_nome?: string | null;
  classe_nome?: string | null;
}

export interface PublicacaoLinha {
  id: string;
  fonte: string;
  numero_cnj: string | null;
  numero_processo_texto: string | null;
  processo_id: string | null;
  tipo: string | null;
  status: StatusPublicacao;
  data_disponibilizacao: string | null;
  data_publicacao: string | null;
  resumo_ia: string | null;
  sugere_sigilo: boolean;
  revisar_classificacao: boolean;
  confianca_ia: number | null;
  cancelada: boolean;
  processos: ProcessoResumo | null;
}

export interface PublicacaoDetalhe extends PublicacaoLinha {
  escritorio_id: string;
  id_externo: string | null;
  hash_djen: string | null;
  tribunal_id: string | null;
  vinculo_tipo: string | null;
  motivo_nao_e_nosso: string | null;
  tipo_origem: string | null;
  tipo_documento: string | null;
  tipo_classificado_por: string | null;
  orgao: string | null;
  classe: string | null;
  meio: string | null;
  link: string | null;
  destinatarios: unknown;
  destinatario_advogados: unknown;
  tratada_por: string | null;
  tratada_em: string | null;
  motivo_tratamento: string | null;
  publicacao_anterior_id: string | null;
  motivo_cancelamento: string | null;
  data_cancelamento: string | null;
  classificacao: unknown;
  criado_em: string;
  atualizado_em: string;
}

export interface FiltrosPublicacoes {
  /** "pendentes" (padrão), "todas" ou um status específico. */
  status: string;
  fonte?: string;
  data?: string;
  responsavel?: string;
  busca?: string;
  pagina: number;
}

/** Lê os filtros da querystring, com valores seguros. */
export function lerFiltrosPublicacoes(q: Record<string, string | undefined>): FiltrosPublicacoes {
  const status = q.status && (q.status === "todas" || (STATUS_PUBLICACAO as readonly string[]).includes(q.status)) ? q.status : "pendentes";
  const fonte = q.fonte && (FONTES_PUBLICACAO as readonly string[]).includes(q.fonte) ? q.fonte : undefined;
  const data = q.data && /^\d{4}-\d{2}-\d{2}$/.test(q.data) ? q.data : undefined;
  const responsavel = q.responsavel && /^[0-9a-f-]{36}$/i.test(q.responsavel) ? q.responsavel : undefined;
  const busca = q.busca?.trim() ? q.busca.trim().slice(0, 60) : undefined;
  const pagina = Math.max(1, Number.parseInt(q.pagina ?? "1", 10) || 1);
  return { status, fonte, data, responsavel, busca, pagina };
}

/** Remove caracteres que quebrariam o filtro `or` do PostgREST. */
function limparBusca(valor: string): string {
  return valor.replace(/[,()%\\"']/g, "").trim();
}

export async function listarPublicacoes(supabase: SupabaseClient, filtros: FiltrosPublicacoes): Promise<{ itens: PublicacaoLinha[]; total: number }> {
  const embed = filtros.responsavel ? "processos!inner(id, numero_cnj_mascara, responsavel_id)" : "processos(id, numero_cnj_mascara, responsavel_id)";
  let consulta = supabase.from("publicacoes").select(`${COLUNAS_LISTA}, ${embed}`, { count: "exact" });

  if (filtros.status === "pendentes") consulta = consulta.in("status", STATUS_PENDENTES);
  else if (filtros.status !== "todas") consulta = consulta.eq("status", filtros.status);
  if (filtros.fonte) consulta = consulta.eq("fonte", filtros.fonte);
  if (filtros.data) consulta = consulta.eq("data_disponibilizacao", filtros.data);
  if (filtros.responsavel) consulta = consulta.eq("processos.responsavel_id", filtros.responsavel);
  if (filtros.busca) {
    const digitos = filtros.busca.replace(/\D/g, "");
    const texto = limparBusca(filtros.busca);
    if (digitos.length >= 4 && texto) consulta = consulta.or(`numero_cnj.ilike.%${digitos}%,numero_processo_texto.ilike.%${texto}%`);
    else if (digitos.length >= 4) consulta = consulta.ilike("numero_cnj", `%${digitos}%`);
    else if (texto) consulta = consulta.ilike("numero_processo_texto", `%${texto}%`);
  }

  const inicio = (filtros.pagina - 1) * POR_PAGINA;
  const { data, count, error } = await consulta.order("data_disponibilizacao", { ascending: false, nullsFirst: false }).order("criado_em", { ascending: false }).range(inicio, inicio + POR_PAGINA - 1);
  if (error) throw new Error(`Falha ao listar publicações: ${error.message}`);
  return { itens: (data ?? []) as unknown as PublicacaoLinha[], total: count ?? 0 };
}

/** Contagem por status (uma consulta `head` por status; o RLS limita ao escritório). */
export async function contarPublicacoesPorStatus(supabase: SupabaseClient): Promise<Record<StatusPublicacao, number>> {
  const contagens = await Promise.all(
    STATUS_PUBLICACAO.map(async (status) => {
      const { count } = await supabase.from("publicacoes").select("id", { count: "exact", head: true }).eq("status", status);
      return [status, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(contagens) as Record<StatusPublicacao, number>;
}

export async function obterPublicacao(supabase: SupabaseClient, id: string): Promise<PublicacaoDetalhe | null> {
  const { data, error } = await supabase
    .from("publicacoes")
    .select(`${COLUNAS_DETALHE}, processos(id, numero_cnj_mascara, responsavel_id, segredo_justica, orgao_julgador_nome, classe_nome)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar publicação: ${error.message}`);
  return (data as unknown as PublicacaoDetalhe | null) ?? null;
}

export interface TextoPublicacao {
  texto: string | null;
  /** true quando a RPC negou por sigilo (processo em segredo de justiça). */
  restrito: boolean;
  erro: string | null;
}

/** Texto pela RPC: checa sigilo e papel e grava auditoria_acessos. */
export async function lerTextoPublicacao(supabase: SupabaseClient, id: string): Promise<TextoPublicacao> {
  const { data, error } = await supabase.rpc("publicacao_texto", { p_publicacao_id: id });
  if (error) {
    const restrito = error.code === "42501" || /sigilos/i.test(error.message);
    return { texto: null, restrito, erro: restrito ? null : error.message };
  }
  return { texto: (data as string | null) ?? null, restrito: false, erro: null };
}

export interface PublicacaoEvento {
  id: string;
  de_status: string | null;
  para_status: string;
  usuario_id: string | null;
  dados: Record<string, unknown>;
  criado_em: string;
}

export async function listarEventosPublicacao(supabase: SupabaseClient, publicacaoId: string): Promise<PublicacaoEvento[]> {
  const { data } = await supabase.from("publicacao_eventos").select("id, de_status, para_status, usuario_id, dados, criado_em").eq("publicacao_id", publicacaoId).order("criado_em", { ascending: true });
  return (data ?? []) as unknown as PublicacaoEvento[];
}

export interface PrazoLigado {
  id: string;
  ato_descricao: string | null;
  data_final: string;
  data_interna: string | null;
  status: string;
  calendario_incompleto: boolean;
}

export async function listarPrazosDaPublicacao(supabase: SupabaseClient, publicacaoId: string): Promise<PrazoLigado[]> {
  const { data } = await supabase.from("prazos").select("id, ato_descricao, data_final, data_interna, status, calendario_incompleto").eq("publicacao_id", publicacaoId).order("data_final");
  return (data ?? []) as unknown as PrazoLigado[];
}

export interface ProcessoOpcao {
  id: string;
  numero_cnj: string;
  numero_cnj_mascara: string | null;
  responsavel_id: string | null;
}

/** Processos do escritório para o select de vínculo (RLS limita ao escritório). */
export async function listarProcessosParaVinculo(supabase: SupabaseClient): Promise<ProcessoOpcao[]> {
  const { data } = await supabase.from("processos").select("id, numero_cnj, numero_cnj_mascara, responsavel_id").order("numero_cnj").limit(1000);
  return (data ?? []) as unknown as ProcessoOpcao[];
}

/** Outras publicações com o mesmo número CNJ (candidatas a "publicação anterior" na marcação de duplicada). */
export async function listarCandidatasDuplicada(supabase: SupabaseClient, publicacao: { id: string; numero_cnj: string | null }): Promise<{ id: string; data_disponibilizacao: string | null; status: string; tipo: string | null }[]> {
  if (!publicacao.numero_cnj) return [];
  const { data } = await supabase.from("publicacoes").select("id, data_disponibilizacao, status, tipo").eq("numero_cnj", publicacao.numero_cnj).neq("id", publicacao.id).order("data_disponibilizacao", { ascending: false }).limit(20);
  return (data ?? []) as { id: string; data_disponibilizacao: string | null; status: string; tipo: string | null }[];
}

export interface Membro {
  usuario_id: string | null;
  nome_completo: string;
  papel: string;
}

/** Membros ativos do escritório: para o filtro de responsável e para mostrar nomes em eventos. */
export async function listarMembros(supabase: SupabaseClient): Promise<Membro[]> {
  const { data } = await supabase.from("escritorio_membros").select("usuario_id, nome_completo, papel").eq("ativo", true).order("nome_completo");
  return (data ?? []) as Membro[];
}

export function mapaNomes(membros: Membro[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of membros) if (x.usuario_id) m.set(x.usuario_id, x.nome_completo);
  return m;
}

export async function obterTimezone(supabase: SupabaseClient, escritorioId: string): Promise<string> {
  const { data } = await supabase.from("escritorios").select("timezone").eq("id", escritorioId).maybeSingle();
  return (data?.timezone as string | undefined) ?? "America/Cuiaba";
}

/** Mensagem amigável a partir do erro do banco (as RPCs já lançam mensagens em português). */
export function mensagemErroBanco(erro: { message?: string; code?: string; details?: string } | null | undefined, padrao = "Não foi possível concluir a ação."): string {
  if (!erro) return padrao;
  const msg = (erro.message ?? "").trim();
  if (!msg) return padrao;
  if (erro.code === "42501" && /permission denied/i.test(msg)) return "Sem permissão para esta ação.";
  if (erro.code === "P0002" && /not found|não encontrad/i.test(msg)) return msg;
  // Erros do PostgREST vêm às vezes com prefixo técnico; mantém só a frase principal.
  return msg.replace(/^(ERROR|FATAL):\s*/i, "").slice(0, 300);
}

/**
 * Depois de um vínculo manual: se a classificação da IA diz que a publicação gera prazo e ainda não há prazo sugerido,
 * calcula e grava o prazo sugerido (mesmo motor do job `classificar`) e move a publicação para `com_prazo_sugerido`.
 * Devolve o id do prazo sugerido a decidir (novo ou já existente), ou null quando não há prazo a decidir.
 */
export async function sugerirPrazoAposVinculo(supabase: SupabaseClient, publicacaoId: string): Promise<string | null> {
  const { data: pub } = await supabase.from("publicacoes").select("id, escritorio_id, processo_id, data_disponibilizacao, classificacao, ia_execucao_id, status").eq("id", publicacaoId).maybeSingle();
  if (!pub || !pub.processo_id) return null;
  const { data: existentes } = await supabase.from("prazos").select("id, status").eq("publicacao_id", publicacaoId).order("criado_em", { ascending: false });
  const sugerido = (existentes ?? []).find((p) => p.status === "sugerido");
  if (sugerido) return sugerido.id as string;
  if ((existentes ?? []).length > 0) return null;
  const classificacao = ClassificacaoPublicacaoSchema.safeParse(pub.classificacao);
  if (!classificacao.success || !classificacao.data.gera_prazo) return null;
  const admin = criarClienteAdmin();
  const resultado = await sugerirPrazo(
    admin,
    { id: pub.id as string, escritorio_id: pub.escritorio_id as string, processo_id: pub.processo_id as string, data_disponibilizacao: (pub.data_disponibilizacao as string | null) ?? null, ia_execucao_id: (pub.ia_execucao_id as string | null) ?? null },
    classificacao.data,
  );
  if (!resultado) return null;
  if (pub.status === "vinculada") {
    await supabase.rpc("transicionar_publicacao", { p_id: publicacaoId, p_para: "com_prazo_sugerido", p_dados: { prazo_id: resultado.prazoId, origem: "vinculo_manual" } });
  }
  return resultado.prazoId;
}
