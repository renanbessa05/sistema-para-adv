/** Valores por extenso em português (reais e percentuais), para contratos. */

const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ateMil(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(" e ");
}

export function inteiroPorExtenso(n: number): string {
  if (!Number.isFinite(n) || n < 0) throw new Error("Número inválido para extenso");
  n = Math.floor(n);
  if (n === 0) return "zero";
  const escalas: [number, string, string][] = [
    [1_000_000_000, "bilhão", "bilhões"],
    [1_000_000, "milhão", "milhões"],
    [1_000, "mil", "mil"],
  ];
  const partes: string[] = [];
  let resto = n;
  for (const [valor, singular, plural] of escalas) {
    const q = Math.floor(resto / valor);
    if (q) {
      if (valor === 1000) partes.push(q === 1 ? "mil" : `${ateMil(q)} mil`);
      else partes.push(`${ateMil(q)} ${q === 1 ? singular : plural}`);
      resto %= valor;
    }
  }
  if (resto) partes.push(ateMil(resto));
  // "e" antes do último grupo quando ele é menor que 100 ou centena redonda
  if (partes.length > 1) {
    const ultimo = partes[partes.length - 1];
    const ultimoValor = resto;
    const usaE = ultimoValor > 0 && (ultimoValor < 100 || ultimoValor % 100 === 0);
    return usaE ? `${partes.slice(0, -1).join(", ")} e ${ultimo}` : partes.join(", ");
  }
  return partes[0];
}

export function reaisPorExtenso(valor: number): string {
  const centavos = Math.round(valor * 100);
  const reais = Math.floor(centavos / 100);
  const cents = centavos % 100;
  const partes: string[] = [];
  if (reais > 0) partes.push(`${inteiroPorExtenso(reais)} ${reais === 1 ? "real" : "reais"}`);
  if (cents > 0) partes.push(`${inteiroPorExtenso(cents)} ${cents === 1 ? "centavo" : "centavos"}`);
  if (partes.length === 0) return "zero reais";
  return partes.join(" e ");
}

export function percentualPorExtenso(p: number): string {
  const inteiro = Math.floor(p);
  const decimal = Math.round((p - inteiro) * 100);
  const base = `${inteiroPorExtenso(inteiro)} por cento`;
  if (!decimal) return base;
  return `${inteiroPorExtenso(inteiro)} vírgula ${inteiroPorExtenso(decimal)} por cento`;
}
