import type { UsoTokens } from "./cliente";

/** Linha de `ref.ia_precos` (US$ por milhão de tokens). */
export interface PrecoModelo {
  modelo: string;
  input_por_mtok: number;
  output_por_mtok: number;
  cache_write_por_mtok?: number | null;
  cache_read_por_mtok?: number | null;
}

/** Custo estimado em US$ com seis casas, conforme a tabela de preços vigente. */
export function calcularCustoUsd(uso: UsoTokens, preco: PrecoModelo): number {
  const porMilhao = (tokens: number, precoMtok: number | null | undefined) => (tokens * (precoMtok ?? 0)) / 1_000_000;
  const total =
    porMilhao(uso.input, preco.input_por_mtok) +
    porMilhao(uso.output, preco.output_por_mtok) +
    porMilhao(uso.cacheWrite, preco.cache_write_por_mtok) +
    porMilhao(uso.cacheRead, preco.cache_read_por_mtok);
  return Math.round(total * 1_000_000) / 1_000_000;
}

/** Delimita texto de terceiros para entrar no prompt como dado, nunca como instrução. */
export function delimitarDado(rotulo: string, texto: string): string {
  const limpo = texto.replace(/<\/?dado[^>]*>/gi, "");
  return `<dado rotulo="${rotulo}">\n${limpo}\n</dado>`;
}
