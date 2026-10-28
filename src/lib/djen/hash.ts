import { createHash } from "node:crypto";
import type { PublicacaoNormalizada } from "./tipos";

/**
 * Deduplicação de publicações do DJEN em duas camadas:
 *
 * 1. `id_externo` (o `id` da API) é a chave primária: a mesma comunicação nunca
 *    deve ser gravada duas vezes. É o índice único em `publicacoes (fonte, id_externo)`.
 * 2. `hashDedup` é a segunda rede: quando o tribunal republica o mesmo conteúdo
 *    com `id` novo (correção, republicação), o hash coincide e o sistema pode
 *    apontar a publicação anterior em vez de criar prazo em duplicidade.
 *
 * O hash não usa `hash_djen` (que muda a cada republicação) nem o HTML bruto
 * (que varia em espaços e marcação): usa tribunal, número do processo, data de
 * disponibilização e o texto simples normalizado.
 */

export type EntradaHashDedup = Pick<
  PublicacaoNormalizada,
  "tribunal_sigla" | "numero_cnj" | "numero_processo_texto" | "data_disponibilizacao" | "texto"
>;

/** Texto em minúsculas, sem espaços duplicados, sem espaços nas pontas. */
export function normalizarTextoParaHash(texto: string | null | undefined): string {
  return (texto ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** sha256 hex de `${tribunal}|${numero_cnj ?? numero_processo_texto}|${data}|${texto normalizado}`. */
export function hashDedup(p: EntradaHashDedup): string {
  const partes = [
    p.tribunal_sigla ?? "",
    p.numero_cnj ?? p.numero_processo_texto ?? "",
    p.data_disponibilizacao ?? "",
    normalizarTextoParaHash(p.texto),
  ];
  return createHash("sha256").update(partes.join("|"), "utf8").digest("hex");
}
