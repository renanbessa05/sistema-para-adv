import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResultadoJob {
  itens: number;
  detalhes?: Record<string, unknown>;
}

/**
 * Executa uma rotina registrando início, fim, itens e erro em `jobs_execucoes`.
 * Nunca lança para fora: a rota responde 200 com o resumo ou 500 com o erro registrado.
 */
export async function executarJob(
  admin: SupabaseClient,
  nome: string,
  fn: () => Promise<ResultadoJob>,
  escritorioId: string | null = null,
): Promise<{ ok: boolean; execucaoId: string | null; itens: number; erro: string | null; detalhes?: Record<string, unknown> }> {
  const { data: criado } = await admin
    .from("jobs_execucoes")
    .insert({ job: nome, escritorio_id: escritorioId, iniciado_em: new Date().toISOString(), status: "executando" })
    .select("id")
    .single();
  const execucaoId = (criado?.id as string | undefined) ?? null;
  try {
    const r = await fn();
    if (execucaoId) {
      await admin.from("jobs_execucoes").update({ finalizado_em: new Date().toISOString(), status: "ok", itens: r.itens, detalhes: r.detalhes ?? null }).eq("id", execucaoId);
    }
    return { ok: true, execucaoId, itens: r.itens, erro: null, detalhes: r.detalhes };
  } catch (e) {
    const erro = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    if (execucaoId) {
      await admin.from("jobs_execucoes").update({ finalizado_em: new Date().toISOString(), status: "erro", erro }).eq("id", execucaoId);
    }
    return { ok: false, execucaoId, itens: 0, erro };
  }
}

/** Escritórios ativos: toda rotina itera escritório a escritório e grava escritorio_id explícito. */
export async function listarEscritoriosAtivos(admin: SupabaseClient): Promise<{ id: string; nome: string; timezone: string }[]> {
  const { data, error } = await admin.from("escritorios").select("id, nome, timezone").eq("ativo", true);
  if (error) throw new Error(`Falha ao listar escritórios: ${error.message}`);
  return (data ?? []) as { id: string; nome: string; timezone: string }[];
}
