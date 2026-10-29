export interface ItemCamada {
  bloco: number;
  bloco_titulo: string;
  item: string;
  situacao: "confirmado" | "a_verificar";
  fonte: string | null;
}

export interface ItemSeed {
  bloco: number;
  bloco_titulo: string;
  item: string;
}

export interface ConfirmacaoEscritorio {
  bloco: number;
  item: string;
  fonte: string;
}

/**
 * Camada local que vai ao agente. Itens do seed começam "a_verificar"; uma confirmação do escritório com fonte os
 * torna "confirmado". Confirmação de item que não está no seed entra como item próprio do escritório.
 */
export function montarCamadaLocal(seed: ItemSeed[], confirmacoes: ConfirmacaoEscritorio[]): ItemCamada[] {
  const chave = (b: number, i: string) => `${b}|${i}`;
  const confirmados = new Map(confirmacoes.map((c) => [chave(c.bloco, c.item), c.fonte]));
  const camada: ItemCamada[] = seed.map((s) => {
    const fonte = confirmados.get(chave(s.bloco, s.item)) ?? null;
    return { bloco: s.bloco, bloco_titulo: s.bloco_titulo, item: s.item, situacao: fonte ? "confirmado" : "a_verificar", fonte };
  });
  for (const c of confirmacoes) {
    if (!seed.some((s) => s.bloco === c.bloco && s.item === c.item)) {
      camada.push({ bloco: c.bloco, bloco_titulo: "Confirmação do escritório", item: c.item, situacao: "confirmado", fonte: c.fonte });
    }
  }
  return camada.sort((a, b) => a.bloco - b.bloco);
}
