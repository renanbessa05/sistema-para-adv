/**
 * Número único de processo (Resolução CNJ 65/2008): NNNNNNN-DD.AAAA.J.TR.OOOO
 * - NNNNNNN: sequencial (7 dígitos)
 * - DD: dígito verificador (módulo 97, ISO 7064)
 * - AAAA: ano do ajuizamento
 * - J: segmento da Justiça (1 dígito)
 * - TR: tribunal (2 dígitos)
 * - OOOO: unidade de origem (4 dígitos)
 */

export interface NumeroCnj {
  digitos: string; // 20 dígitos, sem máscara
  mascara: string; // NNNNNNN-DD.AAAA.J.TR.OOOO
  sequencial: string;
  dv: string;
  ano: number;
  segmento: number;
  tribunal: string; // "11"
  origem: string; // "0041"
  segmentoNome: string;
  tribunalSigla: string | null; // "TJMT" quando conhecido
}

const SEGMENTOS: Record<number, string> = {
  1: "Supremo Tribunal Federal",
  2: "Conselho Nacional de Justiça",
  3: "Superior Tribunal de Justiça",
  4: "Justiça Federal",
  5: "Justiça do Trabalho",
  6: "Justiça Eleitoral",
  7: "Justiça Militar da União",
  8: "Justiça Estadual",
  9: "Justiça Militar Estadual",
};

/** Tribunais de Justiça estaduais por código TR (segmento 8). */
const TJ_POR_CODIGO: Record<string, string> = {
  "01": "TJAC", "02": "TJAL", "03": "TJAP", "04": "TJAM", "05": "TJBA", "06": "TJCE", "07": "TJDFT", "08": "TJES", "09": "TJGO",
  "10": "TJMA", "11": "TJMT", "12": "TJMS", "13": "TJMG", "14": "TJPA", "15": "TJPB", "16": "TJPR", "17": "TJPE", "18": "TJPI",
  "19": "TJRJ", "20": "TJRN", "21": "TJRS", "22": "TJRO", "23": "TJRR", "24": "TJSC", "25": "TJSE", "26": "TJSP", "27": "TJTO",
};

const RE_MASCARA = /(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})/;

export function somenteDigitos(texto: string): string {
  return texto.replace(/\D+/g, "");
}

/** Resto da divisão por 97 de um número grande representado como string de dígitos. */
function mod97(digitos: string): number {
  let resto = 0;
  for (const ch of digitos) {
    resto = (resto * 10 + (ch.charCodeAt(0) - 48)) % 97;
  }
  return resto;
}

/** Calcula o dígito verificador para as partes informadas (sem o DV). */
export function calcularDv(sequencial: string, ano: string, segmento: string, tribunal: string, origem: string): string {
  const base = `${sequencial}${ano}${segmento}${tribunal}${origem}00`;
  const dv = 98 - mod97(base);
  return String(dv).padStart(2, "0");
}

/** Extrai os 20 dígitos de um texto que contenha um número CNJ, com ou sem máscara. Devolve null se não houver. */
export function extrairDigitosCnj(texto: string): string | null {
  if (!texto) return null;
  const m = RE_MASCARA.exec(texto);
  if (m) return `${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}${m[6]}`;
  const d = somenteDigitos(texto);
  return d.length === 20 ? d : null;
}

/** Extrai todos os números CNJ distintos presentes num texto (publicações costumam citar o número). */
export function extrairTodosCnj(texto: string): string[] {
  const vistos = new Set<string>();
  const re = new RegExp(RE_MASCARA.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const d = `${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}${m[6]}`;
    if (validarDigitosCnj(d)) vistos.add(d);
  }
  return [...vistos];
}

/** Verifica o dígito verificador de 20 dígitos. */
export function validarDigitosCnj(digitos: string): boolean {
  if (!/^\d{20}$/.test(digitos)) return false;
  const sequencial = digitos.slice(0, 7);
  const dv = digitos.slice(7, 9);
  const ano = digitos.slice(9, 13);
  const segmento = digitos.slice(13, 14);
  const tribunal = digitos.slice(14, 16);
  const origem = digitos.slice(16, 20);
  return calcularDv(sequencial, ano, segmento, tribunal, origem) === dv;
}

export function formatarCnj(digitos: string): string {
  if (!/^\d{20}$/.test(digitos)) throw new Error("Número CNJ precisa ter 20 dígitos");
  return `${digitos.slice(0, 7)}-${digitos.slice(7, 9)}.${digitos.slice(9, 13)}.${digitos.slice(13, 14)}.${digitos.slice(14, 16)}.${digitos.slice(16, 20)}`;
}

/** Decompõe e valida. Lança erro com mensagem clara quando inválido. */
export function decomporCnj(texto: string): NumeroCnj {
  const digitos = extrairDigitosCnj(texto);
  if (!digitos) throw new Error(`Número CNJ não reconhecido: "${texto}"`);
  if (!validarDigitosCnj(digitos)) throw new Error(`Número CNJ com dígito verificador inválido: ${formatarCnj(digitos)}`);
  const segmento = Number(digitos.slice(13, 14));
  const tribunal = digitos.slice(14, 16);
  return {
    digitos,
    mascara: formatarCnj(digitos),
    sequencial: digitos.slice(0, 7),
    dv: digitos.slice(7, 9),
    ano: Number(digitos.slice(9, 13)),
    segmento,
    tribunal,
    origem: digitos.slice(16, 20),
    segmentoNome: SEGMENTOS[segmento] ?? "Desconhecido",
    tribunalSigla: segmento === 8 ? (TJ_POR_CODIGO[tribunal] ?? null) : null,
  };
}

/** Versão sem exceção: devolve null quando o texto não contém um CNJ válido. */
export function tentarDecomporCnj(texto: string): NumeroCnj | null {
  try {
    return decomporCnj(texto);
  } catch {
    return null;
  }
}

/** Monta um número válido a partir das partes (útil para seeds e testes). */
export function montarCnj(sequencial: number, ano: number, segmento: number, tribunal: string, origem: string): string {
  const seq = String(sequencial).padStart(7, "0");
  const tr = tribunal.padStart(2, "0");
  const or = origem.padStart(4, "0");
  const dv = calcularDv(seq, String(ano), String(segmento), tr, or);
  return `${seq}${dv}${ano}${segmento}${tr}${or}`;
}

export const CODIGO_TJMT = "11";
export const SEGMENTO_ESTADUAL = 8;
