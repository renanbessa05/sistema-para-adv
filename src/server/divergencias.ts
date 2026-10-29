import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adicionarDias, diaDaSemana } from "@/lib/prazos/datas";

/**
 * Divergências da operação paralela (docs/runbooks/operacao-paralela.md, escopo T1.35).
 * Toda sexta o administrativo cruza prazos do sistema com o PJe e registra aqui o que divergiu.
 * O critério de passagem (sistema vira fonte principal) é 4 semanas consecutivas sem divergência não explicada.
 */

export const TIPOS_DIVERGENCIA = ["data_prazo", "publicacao_nao_captada", "classificacao_errada", "cadastro_advogado", "prazo_nao_sugerido", "outro"] as const;
export type TipoDivergencia = (typeof TIPOS_DIVERGENCIA)[number];

export const ROTULO_TIPO_DIVERGENCIA: Record<TipoDivergencia, string> = {
  data_prazo: "Data do prazo diferente",
  publicacao_nao_captada: "Publicação não captada",
  classificacao_errada: "Classificação errada",
  cadastro_advogado: "Cadastro do advogado",
  prazo_nao_sugerido: "Prazo não sugerido",
  outro: "Outro",
};

/** Meta do runbook: semanas seguidas sem divergência não explicada para o sistema virar fonte principal. */
export const META_SEMANAS_LIMPAS = 4;

export interface Divergencia {
  id: string;
  semana: string;
  tipo: TipoDivergencia;
  prazo_id: string | null;
  publicacao_id: string | null;
  processo_id: string | null;
  descricao: string;
  causa: string | null;
  correcao: string | null;
  registrada_por: string | null;
  resolvida_em: string | null;
  criado_em: string;
  processos: { numero_cnj_mascara: string | null } | null;
}

export interface FiltrosDivergencias {
  semana?: string | null;
  tipo?: TipoDivergencia | null;
  /** "abertas" (padrão), "resolvidas" ou "todas". */
  situacao?: "abertas" | "resolvidas" | "todas";
  limite?: number;
}

const COLUNAS = "id, semana, tipo, prazo_id, publicacao_id, processo_id, descricao, causa, correcao, registrada_por, resolvida_em, criado_em, processos(numero_cnj_mascara)";

export function ehTipoDivergencia(valor: string): valor is TipoDivergencia {
  return (TIPOS_DIVERGENCIA as readonly string[]).includes(valor);
}

/** Divergência "não explicada": sem causa preenchida. É o que zera a contagem de semanas limpas. */
export function naoExplicada(d: { causa: string | null }): boolean {
  return !d.causa || d.causa.trim() === "";
}

/**
 * Sexta-feira de referência da conferência semanal: de segunda a sexta, a sexta desta semana
 * (hoje, se for sexta); sábado e domingo, a sexta que acabou de passar.
 */
export function sextaDeReferencia(hoje: string): string {
  const dia = diaDaSemana(hoje); // 0 = domingo ... 6 = sábado
  if (dia === 6) return adicionarDias(hoje, -1);
  if (dia === 0) return adicionarDias(hoje, -2);
  return adicionarDias(hoje, 5 - dia);
}

/** Última sexta-feira já ocorrida (inclusive hoje, se for sexta): a semana mais recente que pode ser avaliada. */
export function ultimaSextaConcluida(hoje: string): string {
  const dia = diaDaSemana(hoje);
  if (dia === 5) return hoje;
  return adicionarDias(hoje, dia === 6 ? -1 : -(dia + 2));
}

/**
 * Semanas consecutivas (sextas) sem divergência não explicada, contadas para trás a partir da última sexta
 * concluída. Só conta a partir da primeira semana registrada: antes da primeira conferência não há o que
 * provar. Uma semana sem nenhum registro, mas posterior à primeira conferência, conta como limpa
 * (a conferência semanal é obrigatória pelo runbook; se não foi feita, registre como "outro").
 */
export function semanasConsecutivasLimpas(divergencias: readonly { semana: string; causa: string | null }[], hoje: string): number {
  if (divergencias.length === 0) return 0;
  const semanasSujas = new Set(divergencias.filter(naoExplicada).map((d) => d.semana));
  const primeira = divergencias.map((d) => d.semana).sort()[0];
  let semana = ultimaSextaConcluida(hoje);
  let n = 0;
  while (semana >= primeira) {
    if (semanasSujas.has(semana)) break;
    n += 1;
    semana = adicionarDias(semana, -7);
  }
  return n;
}

export async function listarDivergencias(supabase: SupabaseClient, filtros: FiltrosDivergencias = {}): Promise<Divergencia[]> {
  let consulta = supabase.from("divergencias_operacao").select(COLUNAS).order("semana", { ascending: false }).order("criado_em", { ascending: false }).limit(filtros.limite ?? 200);
  if (filtros.semana) consulta = consulta.eq("semana", filtros.semana);
  if (filtros.tipo) consulta = consulta.eq("tipo", filtros.tipo);
  const situacao = filtros.situacao ?? "abertas";
  if (situacao === "abertas") consulta = consulta.is("resolvida_em", null);
  if (situacao === "resolvidas") consulta = consulta.not("resolvida_em", "is", null);
  const { data, error } = await consulta;
  if (error) throw new Error(`Falha ao listar divergências: ${error.message}`);
  return (data ?? []) as unknown as Divergencia[];
}

export interface NovaDivergencia {
  escritorioId: string;
  semana: string;
  tipo: TipoDivergencia;
  descricao: string;
  causa?: string | null;
  correcao?: string | null;
  prazoId?: string | null;
  publicacaoId?: string | null;
  processoId?: string | null;
  registradaPor: string;
}

/** Grava com o cliente do usuário: a RLS confere escritório e papel (estagiário não insere). */
export async function registrarDivergencia(supabase: SupabaseClient, d: NovaDivergencia): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const { data, error } = await supabase
    .from("divergencias_operacao")
    .insert({
      escritorio_id: d.escritorioId,
      semana: d.semana,
      tipo: d.tipo,
      descricao: d.descricao,
      causa: d.causa || null,
      correcao: d.correcao || null,
      prazo_id: d.prazoId || null,
      publicacao_id: d.publicacaoId || null,
      processo_id: d.processoId || null,
      registrada_por: d.registradaPor,
    })
    .select("id")
    .single();
  if (error) return { ok: false, erro: error.message };
  return { ok: true, id: data.id as string };
}

/** Marca como resolvida; pode preencher causa e correção no mesmo passo. */
export async function resolverDivergencia(supabase: SupabaseClient, id: string, dados: { causa?: string | null; correcao?: string | null } = {}): Promise<{ ok: true } | { ok: false; erro: string }> {
  const alteracoes: Record<string, unknown> = { resolvida_em: new Date().toISOString() };
  if (dados.causa) alteracoes.causa = dados.causa;
  if (dados.correcao) alteracoes.correcao = dados.correcao;
  const { error, count } = await supabase.from("divergencias_operacao").update(alteracoes, { count: "exact" }).eq("id", id).is("resolvida_em", null);
  if (error) return { ok: false, erro: error.message };
  if (count === 0) return { ok: false, erro: "Divergência não encontrada, já resolvida ou sem permissão." };
  return { ok: true };
}

export interface ResumoSemanal {
  semanaReferencia: string;
  ultimaSemanaConcluida: string;
  semanasConsecutivasLimpas: number;
  meta: number;
  totalRegistradas: number;
  abertas: number;
  naoExplicadas: number;
  /** Semanas distintas com algum registro. */
  semanasRegistradas: string[];
  porTipo: Record<TipoDivergencia, { total: number; abertas: number }>;
  /** Na semana de referência. */
  semanaAtual: { total: number; abertas: number; naoExplicadas: number };
}

/** Resumo para o topo da tela: por tipo e semanas consecutivas sem divergência não explicada. */
export async function resumoSemanal(supabase: SupabaseClient, hoje: string): Promise<ResumoSemanal> {
  const { data, error } = await supabase.from("divergencias_operacao").select("semana, tipo, causa, resolvida_em").order("semana", { ascending: false }).limit(5000);
  if (error) throw new Error(`Falha ao resumir divergências: ${error.message}`);
  const linhas = (data ?? []) as { semana: string; tipo: TipoDivergencia; causa: string | null; resolvida_em: string | null }[];
  const semanaReferencia = sextaDeReferencia(hoje);
  const porTipo = Object.fromEntries(TIPOS_DIVERGENCIA.map((t) => [t, { total: 0, abertas: 0 }])) as Record<TipoDivergencia, { total: number; abertas: number }>;
  const semanaAtual = { total: 0, abertas: 0, naoExplicadas: 0 };
  let abertas = 0;
  let naoExplicadas = 0;
  for (const l of linhas) {
    const aberta = l.resolvida_em === null;
    const bucket = porTipo[l.tipo] ?? porTipo.outro;
    bucket.total += 1;
    if (aberta) {
      bucket.abertas += 1;
      abertas += 1;
    }
    if (naoExplicada(l)) naoExplicadas += 1;
    if (l.semana === semanaReferencia) {
      semanaAtual.total += 1;
      if (aberta) semanaAtual.abertas += 1;
      if (naoExplicada(l)) semanaAtual.naoExplicadas += 1;
    }
  }
  return {
    semanaReferencia,
    ultimaSemanaConcluida: ultimaSextaConcluida(hoje),
    semanasConsecutivasLimpas: semanasConsecutivasLimpas(linhas, hoje),
    meta: META_SEMANAS_LIMPAS,
    totalRegistradas: linhas.length,
    abertas,
    naoExplicadas,
    semanasRegistradas: [...new Set(linhas.map((l) => l.semana))].sort().reverse(),
    porTipo,
    semanaAtual,
  };
}
