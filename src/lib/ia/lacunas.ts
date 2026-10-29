/**
 * Marcador único de lacuna em tudo que a IA produz: `[[VERIFICAR: motivo]]`.
 * As skills do escritório usavam quatro marcas diferentes ("(verificar)", "[VERIFICAR]", "[[CAMPO]]", "[__________]");
 * os agentes passam a usar só esta, e o sistema bloqueia a aprovação enquanto houver lacuna aberta.
 */

export const MARCADOR_LACUNA = /\[\[\s*VERIFICAR\s*:?\s*([^\]]*)\]\]/gi;

export interface Lacuna {
  /** Texto dentro do marcador (o motivo), já aparado. */
  motivo: string;
  /** Posição do marcador no texto (índice do primeiro caractere). */
  posicao: number;
}

export function listarLacunas(texto: string): Lacuna[] {
  const lacunas: Lacuna[] = [];
  for (const m of texto.matchAll(MARCADOR_LACUNA)) {
    lacunas.push({ motivo: (m[1] ?? "").trim(), posicao: m.index ?? 0 });
  }
  return lacunas;
}

export function contarLacunas(texto: string): number {
  return listarLacunas(texto).length;
}

/**
 * Converte as marcas antigas das skills para o marcador único. Usada ao importar texto das skills para os
 * prompts e ao normalizar saídas de modelos que ainda usem a forma antiga.
 */
export function normalizarLacunas(texto: string): string {
  return texto
    .replace(/\[VERIFICAR\]/g, "[[VERIFICAR: ]]")
    .replace(/\(verificar\)/gi, "[[VERIFICAR: ]]")
    .replace(/\[_{3,}\]/g, "[[VERIFICAR: dado faltante]]")
    .replace(/\[\[([A-Z_ ]{3,})\]\]/g, (_, campo: string) => (campo.trim().toUpperCase().startsWith("VERIFICAR") ? `[[${campo}]]` : `[[VERIFICAR: ${campo.trim().toLowerCase()}]]`));
}
