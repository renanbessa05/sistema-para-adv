import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { envServidor } from "@/lib/config/env";
import { escolherTeto } from "@/lib/planos/limites";

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
  const [{ data: gasto }, { data: tetoConfig }, { data: limites }] = await Promise.all([
    admin.rpc("ia_gasto_mes", { p_escritorio: escritorioId }).then((r) => ({ data: r.data as number | string | null })),
    admin.rpc("ia_teto_escritorio", { p_escritorio: escritorioId }).then((r) => ({ data: r.data as number | string | null })),
    admin
      .from("escritorio_limites")
      .select("teto_ia_usd")
      .eq("escritorio_id", escritorioId)
      .maybeSingle()
      .then((r) => ({ data: (r.data as { teto_ia_usd: number | string | null } | null)?.teto_ia_usd ?? null })),
  ]);
  const gastoUsd = Number(gasto ?? 0);
  const tetoUsd = escolherTeto({
    configuracao: tetoConfig === null || tetoConfig === undefined ? null : Number(tetoConfig),
    override: limites === null || limites === undefined ? null : Number(limites),
    padrao,
  });
  const fracao = tetoUsd > 0 ? gastoUsd / tetoUsd : 1;
  return { atingido: tetoUsd > 0 && gastoUsd >= tetoUsd, gastoUsd, tetoUsd, fracao };
}
