/**
 * Citações de jurisprudência numa peça (regra do lote 7): só vale a citação que tem registro na base, ou seja, cujo
 * id foi devolvido pela busca nesta minuta. Citação numerada sem registro vira falta no checklist (validarPeca).
 */
export const RE_CITACAO = /\b(?:Súmula(?:\s+Vinculante)?\s*n?º?\s*\d+|REsp\s*\d[\d.]*|AgInt\s*(?:no\s*)?(?:REsp|AREsp)\s*\d[\d.]*|AREsp\s*\d[\d.]*|RE\s*\d[\d.]{3,}|Tema\s*(?:Repetitivo\s*)?n?º?\s*\d+|Apelação\s+Cível\s*n?º?\s*[\d.-]+|Agravo\s+de\s+Instrumento\s*n?º?\s*[\d.-]+)/gi;

export interface ConferenciaCitacoes {
  /** Citações distintas encontradas no texto, sem repetição de espaços. */
  citadas: string[];
  /** Citações que casam com algum id confirmado pela busca. */
  confirmadas: string[];
  /** Citações sem registro: bloqueiam o envio para aprovação. */
  semRegistro: string[];
}

export function extrairCitacoes(texto: string): string[] {
  return [...new Set([...texto.matchAll(RE_CITACAO)].map((m) => m[0].replace(/\s+/g, " ").replace(/[.\s]+$/, "")))];
}

/** Sem acento, espaço nem pontuação, mantendo a barra do sufixo de tribunal ("REsp 1.234.567/MT" → "resp1234567/mt"). */
function normalizar(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9/]/g, "");
}

/**
 * Casa a citação com o id registrado: igualdade, ou o id é a citação seguida de sufixo que não é número.
 * Assim "Súmula 7" casa com "Súmula 7/STJ", e não com "Súmula 70/STJ".
 */
export function casaCitacao(citacao: string, id: string): boolean {
  const c = normalizar(citacao);
  const i = normalizar(id);
  return i === c || (i.startsWith(c) && !/[0-9]/.test(i.charAt(c.length)));
}

export function conferirCitacoes(texto: string, idsConfirmados: string[]): ConferenciaCitacoes {
  const citadas = extrairCitacoes(texto);
  const confirmadas = citadas.filter((c) => idsConfirmados.some((id) => casaCitacao(c, id)));
  return { citadas, confirmadas, semRegistro: citadas.filter((c) => !confirmadas.includes(c)) };
}
