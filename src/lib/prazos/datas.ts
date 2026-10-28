import type { DataISO } from "./tipos";

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function validarDataISO(valor: string): DataISO {
  const m = RE_ISO.exec(valor);
  if (!m) throw new Error(`Data inválida, esperado YYYY-MM-DD: "${valor}"`);
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    throw new Error(`Data inexistente: "${valor}"`);
  }
  return valor;
}

function paraUtc(data: DataISO): Date {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function deUtc(d: Date): DataISO {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function adicionarDias(data: DataISO, dias: number): DataISO {
  const d = paraUtc(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return deUtc(d);
}

/** 0 = domingo ... 6 = sábado */
export function diaDaSemana(data: DataISO): number {
  return paraUtc(data).getUTCDay();
}

export function ehFimDeSemana(data: DataISO): boolean {
  const ds = diaDaSemana(data);
  return ds === 0 || ds === 6;
}

export function anoDe(data: DataISO): number {
  return Number(data.slice(0, 4));
}

export function compararDatas(a: DataISO, b: DataISO): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Diferença em dias (b - a). */
export function diferencaEmDias(a: DataISO, b: DataISO): number {
  return Math.round((paraUtc(b).getTime() - paraUtc(a).getTime()) / 86_400_000);
}

/** Data civil "hoje" num fuso IANA, a partir de um instante. Única porta de entrada para "hoje" no sistema. */
export function hojeNoFuso(timeZone: string, agora: Date = new Date()): DataISO {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(agora);
  // Os três tipos sempre existem na saída do Intl para este formato.
  const pegar = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return `${pegar("year")}-${pegar("month")}-${pegar("day")}`;
}

/** Formata como DD/MM/AAAA para memória de cálculo e mensagens. */
export function formatarBr(data: DataISO): string {
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}

const NOMES_DIA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
export function nomeDiaSemana(data: DataISO): string {
  return NOMES_DIA[diaDaSemana(data)];
}
