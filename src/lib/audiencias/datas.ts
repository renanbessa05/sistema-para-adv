import { instanteLocal } from "../notificacoes/horas-uteis";

/** Converte o valor de <input type="datetime-local"> (AAAA-MM-DDTHH:MM, horário do escritório) no instante real. */
export function instanteDeFormulario(valor: string, tz: string): Date {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(valor);
  if (!m) throw new Error("Data e hora inválidas (use AAAA-MM-DDTHH:MM)");
  return instanteLocal(m[1], Number(m[2]), Number(m[3]), tz);
}

/** Hora HH:MM no fuso do escritório, para textos de alerta. */
export function horaLocal(instante: Date, tz: string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(instante);
}
