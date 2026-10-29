import type { Serie } from "./atualizar";

/**
 * Séries do Banco Central (SGS). Códigos a confirmar no portal do BCB antes do uso em cálculo real:
 * INPC 188, IPCA 433, IPCA-E 10764, IGP-M 189, SELIC acumulada no mês 4390, TR 226.
 * Cada série devolve variação mensal em %, com data "dd/mm/aaaa" e valor com vírgula decimal.
 */
export const CODIGOS_SGS = { inpc: 188, ipca: 433, ipca_e: 10764, igpm: 189, selic: 4390, tr: 226 } as const;
export type IndiceSgs = keyof typeof CODIGOS_SGS;

export interface LinhaSgs {
  data: string;
  valor: string;
}

/** Converte a resposta do SGS em série "YYYY-MM" -> %. Linhas inválidas são erro: não se descarta dado calado. */
export function parsearSerieSgs(linhas: LinhaSgs[]): Serie {
  const serie: Serie = {};
  for (const l of linhas) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(l.data);
    if (!m) throw new Error(`Data inválida na série do BCB: ${l.data}`);
    const valor = Number(String(l.valor).replace(",", "."));
    if (!Number.isFinite(valor)) throw new Error(`Valor inválido na série do BCB (${l.data}): ${l.valor}`);
    serie[`${m[3]}-${m[2]}`] = valor;
  }
  return serie;
}

export function urlSgs(base: string, codigo: number, dataInicialDdMmAaaa: string): string {
  return `${base.replace(/\/$/, "")}.${codigo}/dados?formato=json&dataInicial=${dataInicialDdMmAaaa}`;
}
