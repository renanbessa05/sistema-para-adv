/**
 * Utilitários de calendário sem biblioteca de datas: fuso via Intl.DateTimeFormat.
 *
 * "Dia útil" aqui é só segunda a sexta fora da lista de feriados recebida como
 * parâmetro; o calendário forense completo (suspensões, recesso) é
 * responsabilidade de src/lib/prazos, que fornece a lista.
 */

export const TZ_PADRAO = "America/Cuiaba";

export interface PartesLocais {
  /** YYYY-MM-DD no fuso. */
  data: string;
  /** 0-23. */
  hora: number;
  /** 0-59. */
  minuto: number;
  /** 0 = domingo ... 6 = sábado. */
  diaSemana: number;
}

export interface OpcoesDiaUtil {
  /** Datas YYYY-MM-DD sem expediente. */
  feriados: readonly string[];
}

export interface OpcoesExpediente extends OpcoesDiaUtil {
  tz?: string;
  /** Hora de abertura do expediente (0-24); padrão 8. */
  expedienteInicio?: number;
  /** Hora de fechamento do expediente (0-24); padrão 18. */
  expedienteFim?: number;
}

const DIAS_SEMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatadores = new Map<string, Intl.DateTimeFormat>();

function formatador(tz: string): Intl.DateTimeFormat {
  let fmt = formatadores.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    formatadores.set(tz, fmt);
  }
  return fmt;
}

/** Decompõe um instante em data, hora, minuto e dia da semana no fuso indicado. */
export function partesLocais(data: Date, tz: string = TZ_PADRAO): PartesLocais {
  const partes = formatador(tz).formatToParts(data);
  const obter = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? "";
  return {
    data: `${obter("year")}-${obter("month")}-${obter("day")}`,
    // Alguns runtimes devolvem "24" para meia-noite; o módulo normaliza.
    hora: Number(obter("hour")) % 24,
    minuto: Number(obter("minute")),
    diaSemana: DIAS_SEMANA[obter("weekday")] ?? new Date(`${obter("year")}-${obter("month")}-${obter("day")}T00:00:00Z`).getUTCDay(),
  };
}

const PADRAO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

function validarDataISO(dataISO: string): [number, number, number] {
  const m = PADRAO_DATA.exec(dataISO);
  if (!m) throw new Error(`Data inválida, esperado YYYY-MM-DD: ${dataISO}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Dia da semana (0 = domingo) de uma data YYYY-MM-DD, independente de fuso. */
export function diaSemanaDe(dataISO: string): number {
  const [ano, mes, dia] = validarDataISO(dataISO);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/** Soma (ou subtrai) dias corridos a uma data YYYY-MM-DD. */
export function adicionarDias(dataISO: string, dias: number): string {
  const [ano, mes, dia] = validarDataISO(dataISO);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** Sábado, domingo ou feriado da lista → false. */
export function ehDiaUtil(dataISO: string, { feriados }: OpcoesDiaUtil): boolean {
  const diaSemana = diaSemanaDe(dataISO);
  if (diaSemana === 0 || diaSemana === 6) return false;
  return !feriados.includes(dataISO);
}

/** Próximo dia útil estritamente após `dataISO`. */
export function proximoDiaUtil(dataISO: string, opcoes: OpcoesDiaUtil): string {
  let dia = adicionarDias(dataISO, 1);
  let tentativas = 0;
  while (!ehDiaUtil(dia, opcoes)) {
    dia = adicionarDias(dia, 1);
    if (++tentativas > 3660) throw new Error("Calendário sem dia útil em 10 anos; lista de feriados suspeita");
  }
  return dia;
}

/**
 * Instante UTC correspondente a `dataISO` às hora:minuto no fuso indicado.
 * Converge em até duas iterações mesmo em fusos com horário de verão.
 */
export function instanteLocal(dataISO: string, hora: number, minuto: number, tz: string = TZ_PADRAO): Date {
  const [ano, mes, dia] = validarDataISO(dataISO);
  const alvo = Date.UTC(ano, mes - 1, dia, hora, minuto);
  let palpite = alvo;
  for (let i = 0; i < 3; i++) {
    const p = partesLocais(new Date(palpite), tz);
    const [pa, pm, pd] = p.data.split("-").map(Number);
    const comoUtc = Date.UTC(pa, pm - 1, pd, p.hora, p.minuto);
    // Quanto a leitura local do palpite se afasta do alvo; corrige o palpite nessa medida.
    const diferenca = comoUtc - alvo;
    if (diferenca === 0) break;
    palpite -= diferenca;
  }
  return new Date(palpite);
}

/**
 * Horas úteis entre dois instantes: só minutos dentro do expediente
 * (padrão 8h-18h local) em dias úteis. Devolve número decimal; fim ≤ início → 0.
 */
export function horasUteisEntre(inicio: Date, fim: Date, opcoes: OpcoesExpediente): number {
  if (fim.getTime() <= inicio.getTime()) return 0;
  const tz = opcoes.tz ?? TZ_PADRAO;
  const abertura = (opcoes.expedienteInicio ?? 8) * 60;
  const fechamento = (opcoes.expedienteFim ?? 18) * 60;
  if (fechamento <= abertura) return 0;

  const pi = partesLocais(inicio, tz);
  const pf = partesLocais(fim, tz);
  const minutosInicio = pi.hora * 60 + pi.minuto;
  const minutosFim = pf.hora * 60 + pf.minuto;

  let totalMinutos = 0;
  let dia = pi.data;
  let iteracoes = 0;
  while (dia <= pf.data) {
    if (ehDiaUtil(dia, opcoes)) {
      const de = dia === pi.data ? Math.max(minutosInicio, abertura) : abertura;
      const ate = dia === pf.data ? Math.min(minutosFim, fechamento) : fechamento;
      if (ate > de) totalMinutos += ate - de;
    }
    dia = adicionarDias(dia, 1);
    if (++iteracoes > 3660) break; // mais de 10 anos: evita laço infinito com entrada absurda
  }
  return totalMinutos / 60;
}

/**
 * O próprio instante quando já está dentro do expediente de um dia útil; caso
 * contrário, a abertura do expediente do próximo dia útil (hoje, se ainda não abriu).
 */
export function proximoInstanteUtil(data: Date, opcoes: OpcoesExpediente): Date {
  const tz = opcoes.tz ?? TZ_PADRAO;
  const abertura = opcoes.expedienteInicio ?? 8;
  const fechamento = opcoes.expedienteFim ?? 18;
  const p = partesLocais(data, tz);
  const minutos = p.hora * 60 + p.minuto;
  const hojeUtil = ehDiaUtil(p.data, opcoes);

  if (hojeUtil && minutos >= abertura * 60 && minutos < fechamento * 60) return data;

  const dia = hojeUtil && minutos < abertura * 60 ? p.data : proximoDiaUtil(p.data, opcoes);
  return instanteLocal(dia, abertura, 0, tz);
}
