import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Papel, Sessao } from "./sessao";

export const STATUS_PROCESSO: Record<string, string> = { ativo: "Ativo", suspenso: "Suspenso", arquivado: "Arquivado", baixado: "Baixado" };
export const POLOS: Record<string, string> = { ativo: "Polo ativo", passivo: "Polo passivo", terceiro: "Terceiro", outro: "Outro" };
export const COMPETENCIAS: Record<string, string> = { vara_comum: "Vara comum", juizado_especial: "Juizado Especial", segundo_grau: "Segundo grau", outra: "Outra" };
export const SISTEMAS: Record<string, string> = { pje: "PJe", projudi: "Projudi", eproc: "eproc", esaj: "e-SAJ", outro: "Outro" };

/** Fases padrão do kanban (ordem e códigos TPU de movimento associados; códigos a confirmar contra a TPU). */
export const FASES_PADRAO: { nome: string; cor: string; codigos_tpu: number[] }[] = [
  { nome: "Distribuído", cor: "#64748b", codigos_tpu: [26] },
  { nome: "Citação/Defesa", cor: "#0ea5e9", codigos_tpu: [] },
  { nome: "Saneamento/Instrução", cor: "#6366f1", codigos_tpu: [] },
  { nome: "Sentença", cor: "#f59e0b", codigos_tpu: [193, 196, 198] },
  { nome: "Recurso", cor: "#ec4899", codigos_tpu: [] },
  { nome: "Cumprimento/Execução", cor: "#10b981", codigos_tpu: [] },
  { nome: "Suspenso", cor: "#a3a3a3", codigos_tpu: [] },
  { nome: "Arquivado", cor: "#525252", codigos_tpu: [22, 246] },
];

export interface Fase {
  id: string;
  nome: string;
  ordem: number;
  cor: string | null;
  codigos_tpu: number[];
  ativa: boolean;
}

export async function listarFases(supabase: SupabaseClient, escritorioId: string, opcoes: { somenteAtivas?: boolean } = {}): Promise<Fase[]> {
  let consulta = supabase.from("fases_kanban").select("id, nome, ordem, cor, codigos_tpu, ativa").eq("escritorio_id", escritorioId).order("ordem");
  if (opcoes.somenteAtivas !== false) consulta = consulta.eq("ativa", true);
  const { data, error } = await consulta;
  if (error) throw new Error(`Falha ao listar fases: ${error.message}`);
  return (data ?? []) as Fase[];
}

/** Cria as fases padrão quando o escritório ainda não tem nenhuma. Idempotente (UNIQUE escritorio_id, nome). */
export async function garantirFasesPadrao(supabase: SupabaseClient, escritorioId: string): Promise<Fase[]> {
  const existentes = await listarFases(supabase, escritorioId, { somenteAtivas: false });
  if (existentes.length > 0) return existentes.filter((f) => f.ativa);
  const { error } = await supabase.from("fases_kanban").upsert(
    FASES_PADRAO.map((f, i) => ({ escritorio_id: escritorioId, nome: f.nome, ordem: i + 1, cor: f.cor, codigos_tpu: f.codigos_tpu, ativa: true })),
    { onConflict: "escritorio_id,nome", ignoreDuplicates: true },
  );
  if (error) throw new Error(`Falha ao criar fases padrão: ${error.message}`);
  return listarFases(supabase, escritorioId);
}

export interface Comarca {
  id: string;
  nome: string;
  tribunal_id: string;
}

/** Comarcas do TJ-MT (ref.comarcas), em ordem alfabética. */
export async function listarComarcas(supabase: SupabaseClient, sigla = "TJMT"): Promise<{ tribunalId: string | null; comarcas: Comarca[] }> {
  const { data: tribunal } = await supabase.schema("ref").from("tribunais").select("id").eq("sigla", sigla).maybeSingle();
  const tribunalId = (tribunal?.id as string | undefined) ?? null;
  if (!tribunalId) return { tribunalId: null, comarcas: [] };
  const { data, error } = await supabase.schema("ref").from("comarcas").select("id, nome, tribunal_id").eq("tribunal_id", tribunalId).eq("ativa", true).order("nome");
  if (error) throw new Error(`Falha ao listar comarcas: ${error.message}`);
  return { tribunalId, comarcas: (data ?? []) as Comarca[] };
}

export async function mapaComarcas(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const mapa = new Map<string, string>();
  if (unicos.length === 0) return mapa;
  const { data } = await supabase.schema("ref").from("comarcas").select("id, nome").in("id", unicos);
  for (const c of data ?? []) mapa.set(c.id as string, c.nome as string);
  return mapa;
}

/** Próximo prazo fatal em aberto por processo (confirmado, prorrogado ou vencido), em segunda consulta simples. */
export async function proximosPrazosPorProcesso(supabase: SupabaseClient, processoIds: string[]): Promise<Map<string, { id: string; data_final: string; status: string; ato_descricao: string | null }>> {
  const mapa = new Map<string, { id: string; data_final: string; status: string; ato_descricao: string | null }>();
  if (processoIds.length === 0) return mapa;
  const { data } = await supabase
    .from("prazos")
    .select("id, processo_id, data_final, status, ato_descricao")
    .in("processo_id", processoIds)
    .in("status", ["confirmado", "prorrogado", "vencido"])
    .order("data_final", { ascending: true });
  for (const p of data ?? []) {
    const pid = p.processo_id as string;
    if (!mapa.has(pid)) mapa.set(pid, { id: p.id as string, data_final: p.data_final as string, status: p.status as string, ato_descricao: (p.ato_descricao as string | null) ?? null });
  }
  return mapa;
}

/** Papéis que cadastram e editam processo e cliente (docs/regras/permissoes.md). */
export function podeEditarProcesso(papel: Papel): boolean {
  return papel === "socio" || papel === "advogado" || papel === "administrativo";
}

/** Marcar sigilo: só advogado e sócio. */
export function podeMarcarSigilo(papel: Papel): boolean {
  return papel === "socio" || papel === "advogado";
}

/** Importar carteira: sócio, advogado e administrativo. */
export function podeImportarCarteira(papel: Papel): boolean {
  return podeEditarProcesso(papel);
}

/** Quem pode agir no processo (trocar responsável, confirmar prazo): sócio ou advogado responsável/colaborador. */
export function podeAgirNoProcesso(sessao: Sessao, processo: { responsavel_id: string | null }, colaboradores: string[]): boolean {
  if (sessao.papel === "socio") return true;
  if (sessao.papel !== "advogado") return false;
  return processo.responsavel_id === sessao.usuarioId || colaboradores.includes(sessao.usuarioId);
}

/** Quem vê o conteúdo (texto, resumo) de processo sigiloso. Fora disso só número e data. */
export function podeVerSigiloso(sessao: Sessao, processo: { segredo_justica: boolean; responsavel_id: string | null }, colaboradores: string[]): boolean {
  if (!processo.segredo_justica) return true;
  return podeAgirNoProcesso(sessao, processo, colaboradores);
}

/** Converte "1.234,56" ou "1234.56" em número; vazio vira null. */
export function lerValorMonetario(texto: string | null | undefined): number | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalizado.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function formatarValor(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

/** Máscara simples de CPF (11 dígitos) ou CNPJ (14 dígitos); outros tamanhos voltam como vieram. */
export function formatarDocumento(doc: string | null | undefined): string {
  const d = (doc ?? "").replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return doc ?? "";
}
