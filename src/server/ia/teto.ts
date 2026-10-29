import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { envServidor } from "@/lib/config/env";

/**
 * Teto mensal de IA por escritório. Ordem: `escritorio_configuracoes['ia.teto_mensal_usd']` → (Fase 3) limites do
 * plano → `IA_TETO_MENSAL_USD` do ambiente. O gasto é a soma de `ia_execucoes.custo_estimado` no mês (UTC),
 * calculada no banco por app.ia_gasto_mes.
 */
export interface EstadoTeto {
  atingido: boolean;
  gastoUsd: number;
  tetoUsd: number;
  /** Fração usada (0..1+). */
  fracao: number;
}

export async function verificarTeto(admin: SupabaseClient, escritorioId: string): Promise<EstadoTeto> {
  const padrao = envServidor().IA_TETO_MENSAL_USD;
  const [{ data: gasto }, { data: tetoConfig }] = await Promise.all([
    admin.rpc("ia_gasto_mes", { p_escritorio: escritorioId }).then((r) => ({ data: r.data as number | string | null })),
    admin.rpc("ia_teto_escritorio", { p_escritorio: escritorioId }).then((r) => ({ data: r.data as number | string | null })),
  ]);
  const gastoUsd = Number(gasto ?? 0);
  const tetoUsd = tetoConfig === null || tetoConfig === undefined ? padrao : Number(tetoConfig);
  const fracao = tetoUsd > 0 ? gastoUsd / tetoUsd : 1;
  return { atingido: tetoUsd > 0 && gastoUsd >= tetoUsd, gastoUsd, tetoUsd, fracao };
}
