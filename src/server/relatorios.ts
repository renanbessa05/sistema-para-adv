import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { linhaDeRpc, type LinhaProdutividade } from "@/lib/relatorios/agregar";

/**
 * Produtividade por usuário no período, pela RPC metricas_usuarios_do_escritorio.
 * Com o cliente do usuário, o escritório vem do JWT e a RPC recusa estagiário (42501).
 * Com a service role (job), informe o escritório.
 */
export async function produtividadeDoPeriodo(supabase: SupabaseClient, de: string, ate: string, escritorioId?: string): Promise<LinhaProdutividade[]> {
  const { data, error } = await supabase.rpc("metricas_usuarios_do_escritorio", {
    p_de: de,
    p_ate: ate,
    p_escritorio_id: escritorioId ?? null,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(linhaDeRpc);
}

export const TIPO_EXPORTACAO_PRODUTIVIDADE = "relatorio_produtividade_mensal";
export const TIPO_AGENDAMENTO_PRODUTIVIDADE = "produtividade_mensal";
