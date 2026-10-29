/**
 * Regras puras do atendimento ao cliente por WhatsApp (lote 14; docs/regras/atendimento-cliente.md).
 *
 * Nenhuma função aqui toca banco ou rede. O servidor (src/server/atendimento-cliente.ts) junta os dados
 * e pergunta a este módulo se pode enviar. Em dúvida, a resposta é "não".
 */

export interface RegraHorario {
  /** "HH:MM" ou "HH:MM:SS" (formato do Postgres time); null quando o escritório ainda não configurou. */
  horarioInicio: string | null;
  horarioFim: string | null;
  /** Dias ISO: 1 = segunda ... 7 = domingo. null quando não configurado. */
  diasSemana: number[] | null;
}

export type SituacaoHorario = "dentro" | "fora" | "sem_horario";

const DIA_ISO: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function minutosDe(hora: string): number {
  const [h, m] = hora.split(":");
  return Number(h) * 60 + Number(m);
}

/** Hora e dia ISO no fuso do escritório, sem depender do fuso do servidor. */
export function partesNoFuso(agora: Date, timeZone: string): { diaSemana: number; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(agora);
  const obter = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return { diaSemana: DIA_ISO[obter("weekday")] ?? 1, minutos: Number(obter("hour")) * 60 + Number(obter("minute")) };
}

/**
 * "dentro" quando o instante cai no dia e na faixa configurados; "sem_horario" quando não há configuração
 * (nunca se inventa um horário comercial); "fora" caso contrário. Faixa é [início, fim).
 */
export function situacaoHorario(regra: RegraHorario | null, agora: Date, timeZone: string): SituacaoHorario {
  if (!regra || !regra.horarioInicio || !regra.horarioFim || !regra.diasSemana || regra.diasSemana.length === 0) return "sem_horario";
  const { diaSemana, minutos } = partesNoFuso(agora, timeZone);
  const noDia = regra.diasSemana.includes(diaSemana);
  const naFaixa = minutos >= minutosDe(regra.horarioInicio) && minutos < minutosDe(regra.horarioFim);
  return noDia && naFaixa ? "dentro" : "fora";
}

/** Pedido de descadastro: o cliente manda "sair", "parar" ou "cancelar" (com ou sem pontuação). */
export function ehOptOut(texto: string): boolean {
  return /^(sair|parar|cancelar)[.!\s]*$/i.test(texto.trim());
}

/** Código de 6 dígitos mandado pelo cliente para confirmar o próprio número; null se não for código. */
export function codigoDaMensagem(texto: string): string | null {
  const limpo = texto.trim().replace(/\s+/g, "");
  return /^\d{6}$/.test(limpo) ? limpo : null;
}

export interface EstadoContatoParaEnvio {
  envioAtivo: boolean;
  verificado: boolean;
  optIn: boolean;
  optOut: boolean;
  /** O texto cita processo em segredo de justiça (aprovação ou resposta automática). */
  processoSigiloso: boolean;
  /** "automatica": resposta fixa do sistema. "aprovada": resposta livre já aprovada por pessoa. */
  origem: "automatica" | "aprovada";
}

export type DecisaoEnvio = { enviar: true } | { enviar: false; motivo: string };

/**
 * Único ponto que decide se uma mensagem ao cliente pode sair. Resposta livre sem aprovação humana nunca
 * chega aqui com origem "aprovada": quem chama já garante a aprovação. A ordem dos motivos é fixa.
 */
export function decidirEnvio(e: EstadoContatoParaEnvio): DecisaoEnvio {
  if (e.processoSigiloso) return { enviar: false, motivo: "processo em segredo de justiça: envio bloqueado" };
  if (!e.envioAtivo) return { enviar: false, motivo: "envio ao cliente desligado nas configurações" };
  if (!e.verificado) return { enviar: false, motivo: "contato ainda não verificado" };
  if (e.optOut) return { enviar: false, motivo: "cliente pediu para não receber mensagens" };
  if (!e.optIn) return { enviar: false, motivo: "sem consentimento do cliente (opt-in)" };
  return { enviar: true };
}

/** Limite de mensagens recebidas de um cliente por hora antes de o sistema silenciar (proteção de ritmo). */
export const LIMITE_CLIENTE_MENSAGENS_HORA = 10;
