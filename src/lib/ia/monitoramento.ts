/**
 * Regras puras de custo e teto de IA (lote 10). Sem banco, sem Next: quem chama lê os números e decide.
 * Teto e alerta: docs/regras/agentes.md, regra 10; docs/regras/avaliacao-ia.md.
 */

export const PERCENTUAL_ALERTA_PADRAO = 80;

/** Lê `ia.alerta_percentual` de escritorio_configuracoes. Valor inválido ou ausente cai no padrão (80%). */
export function percentualAlerta(valor: unknown): number {
  const n = typeof valor === "number" ? valor : typeof valor === "string" && valor.trim() !== "" ? Number(valor) : NaN;
  if (!Number.isFinite(n) || n < 1 || n > 100) return PERCENTUAL_ALERTA_PADRAO;
  return n;
}

/** Alerta quando o gasto chega ao percentual do teto (teto zero ou negativo nunca alerta). */
export function deveAlertarTeto(gastoUsd: number, tetoUsd: number, percentual: number): boolean {
  if (!(tetoUsd > 0)) return false;
  return gastoUsd >= (tetoUsd * percentual) / 100;
}

/** Mês de referência em UTC (YYYY-MM), o mesmo recorte do teto (app.ia_gasto_mes). */
export function mesDeReferencia(agora: Date): string {
  return agora.toISOString().slice(0, 7);
}

/** Início do mês em UTC, em ISO 8601, para filtros de criado_em. */
export function inicioDoMesUtc(agora: Date): string {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)).toISOString();
}

/** Parte do input que veio do cache de leitura: cache_read / (input + cache_write + cache_read). Null sem tokens. */
export function taxaCacheHit(input: number, cacheEscrita: number, cacheLeitura: number): number | null {
  const total = input + cacheEscrita + cacheLeitura;
  if (total <= 0) return null;
  return Math.round((cacheLeitura / total) * 10000) / 10000;
}
