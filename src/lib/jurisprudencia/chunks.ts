/**
 * Divide o teor de um acórdão em trechos para busca. Corta em parágrafo; parágrafo longo corta no ponto final mais
 * próximo do limite (ou no limite, se não houver). Trechos ficam perto de `alvo` caracteres, sem perder texto.
 */
export function dividirEmChunks(texto: string, alvo = 1200): string[] {
  const blocos = texto
    .split(/\n\s*\n/)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap((b) => quebrarLongo(b, alvo));
  const saida: string[] = [];
  let atual = "";
  for (const bloco of blocos) {
    if (atual && atual.length + 1 + bloco.length > alvo) {
      saida.push(atual);
      atual = bloco;
    } else {
      atual = atual ? `${atual} ${bloco}` : bloco;
    }
  }
  if (atual) saida.push(atual);
  return saida;
}

function quebrarLongo(bloco: string, alvo: number): string[] {
  const partes: string[] = [];
  let resto = bloco;
  while (resto.length > alvo) {
    // Prefere o fim de frase, depois o último espaço (nunca corta palavra ao meio); só então o limite seco.
    const ponto = resto.lastIndexOf(". ", alvo);
    const espaco = resto.lastIndexOf(" ", alvo);
    const corte = ponto > 0 ? ponto + 1 : espaco > 0 ? espaco : alvo;
    partes.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) partes.push(resto);
  return partes;
}
