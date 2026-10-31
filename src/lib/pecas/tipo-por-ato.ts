import type { TipoPeca } from "@/lib/ia/schemas/minutas";

/**
 * Sugere o tipo de peça a partir da descrição do ato do prazo ("contestar", "apresentar réplica", "recorrer da sentença"…).
 * Só casa o óbvio; na dúvida devolve petição intermediária quando há prazo, ou inicial quando não há.
 */
export function tipoPecaPorAto(ato: string | null | undefined, temPrazo: boolean): TipoPeca {
  const t = (ato ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (!t) return temPrazo ? "peticao_intermediaria" : "inicial";
  if (/contrarraz/.test(t)) return "contrarrazoes";
  if (/contest/.test(t)) return "contestacao";
  if (/replica|impugnacao a contestacao|impugnar a contestacao/.test(t)) return "replica";
  if (/embargos de declaracao|embargos declaratorios|aclaratorios/.test(t)) return "embargos_declaracao";
  if (/agravo/.test(t)) return "agravo_instrumento";
  if (/apela/.test(t)) return "apelacao";
  if (/cumprimento de sentenca|cumprimento da sentenca/.test(t)) return "cumprimento_sentenca";
  if (/impugna/.test(t)) return "impugnacao";
  if (/mandado de seguranca/.test(t)) return "mandado_seguranca";
  if (/recorr|recurso/.test(t)) return "apelacao";
  return temPrazo ? "peticao_intermediaria" : "inicial";
}
