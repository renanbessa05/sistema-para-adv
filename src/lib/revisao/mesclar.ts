import type { ItemRevisao, Revisao } from "../ia/schemas/revisao";
import type { ItemValidacao, ResultadoValidacao } from "../pecas/validar";

/**
 * Mesclagem determinística do revisor (puro): o que o código conferiu (validarPeca) prevalece sobre o que o modelo
 * disse. Falta vira crítico; ok vira ok; atenção fica atenção. Itens que só o modelo pode julgar mantêm o veredito
 * dele. O resultado é a lista que vai para minuta_revisoes.itens.
 */

export type SituacaoFinal = "ok" | "atencao" | "critico" | "nao_verificavel";

export interface ItemFinal {
  id: string;
  situacao: SituacaoFinal;
  observacao: string | null;
  fonte: "codigo" | "modelo";
  justificativa?: string;
}

/** Relação entre ids do checklist e rótulos da validação determinística. */
const MAPA_CODIGO: Partial<Record<ItemRevisao, string[]>> = {
  enderecamento: ["enderecamento"],
  qualificacao: ["qualificacao"],
  oab: ["oab"],
  email: ["email"],
  cnj: ["cnj"],
  valor_causa: ["valor_causa"],
  pedidos_infinitivo: ["pedidos_infinitivo"],
  tutela_art300: ["tutela_art300"],
  docs: ["docs"],
  lacunas: ["lacunas"],
  jurisprudencia: ["jurisprudencia"],
  tempestividade: ["tempestividade"],
};

function daValidacao(itens: ItemValidacao[], ids: string[]): ItemValidacao | undefined {
  return itens.find((i) => ids.includes(i.id));
}

function paraSituacao(s: ItemValidacao["situacao"]): SituacaoFinal | null {
  if (s === "ok") return "ok";
  if (s === "atencao") return "atencao";
  if (s === "falta") return "critico";
  return null; // nao_aplicavel: não entra na lista
}

export function mesclarRevisao(modelo: Revisao, validacao: ResultadoValidacao): ItemFinal[] {
  const saida = new Map<string, ItemFinal>();

  for (const item of modelo.checklist) {
    saida.set(item.id, { id: item.id, situacao: item.situacao, observacao: item.observacao, fonte: "modelo" });
  }

  for (const [id, ids] of Object.entries(MAPA_CODIGO) as [ItemRevisao, string[]][]) {
    const v = daValidacao(validacao.itens, ids);
    if (!v) continue;
    const situacao = paraSituacao(v.situacao);
    if (situacao === null) {
      // O código diz que o item não se aplica: não há crítico por ele, mas o modelo não pode criar um.
      saida.delete(id);
      continue;
    }
    saida.set(id, { id, situacao, observacao: v.detalhe, fonte: "codigo" });
  }

  return [...saida.values()].sort((a, b) => ITENS_ORDEM(a.id) - ITENS_ORDEM(b.id));
}

const ORDEM = [
  "enderecamento",
  "competencia",
  "qualificacao",
  "oab",
  "email",
  "cnj",
  "valor_causa",
  "pedidos_infinitivo",
  "pedidos_correlacao",
  "tutela_art300",
  "docs",
  "documentos_indispensaveis",
  "recursos_tempestividade",
  "contestacao_impugnacao",
  "juizado_fazenda_12153",
  "fazenda_servidores_mt",
  "higiene_pje",
  "lacunas",
  "jurisprudencia",
  "tempestividade",
];
function ITENS_ORDEM(id: string): number {
  const i = ORDEM.indexOf(id);
  return i === -1 ? ORDEM.length : i;
}

/** Quantos itens críticos ainda estão abertos (sem justificativa). */
export function criticosAbertos(itens: ItemFinal[]): number {
  return itens.filter((i) => i.situacao === "critico" && !i.justificativa).length;
}
