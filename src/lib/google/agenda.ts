/**
 * Google Agenda (API v3) com fetch puro. Desligado até a conta Google do escritório existir (decisão do plano).
 * O cliente recebe o fetch por injeção: os testes usam um falso, sem rede.
 */
export const URL_AGENDA = "https://www.googleapis.com/calendar/v3";
export const DURACAO_PADRAO_MIN = 60;

export interface EventoAgenda {
  summary: string;
  description: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
}

export interface AudienciaParaAgenda {
  tipo: string;
  inicio: Date;
  duracaoMin?: number;
  processo: string;
  modalidade: "presencial" | "virtual";
  localOuLink: string | null;
  tz: string;
}

export function montarEventoAgenda(a: AudienciaParaAgenda): EventoAgenda {
  const fim = new Date(a.inicio.getTime() + (a.duracaoMin ?? DURACAO_PADRAO_MIN) * 60_000);
  const evento: EventoAgenda = {
    summary: `Audiência de ${a.tipo} · ${a.processo}`,
    description: `Processo ${a.processo} (${a.modalidade}).`,
    start: { dateTime: a.inicio.toISOString(), timeZone: a.tz },
    end: { dateTime: fim.toISOString(), timeZone: a.tz },
  };
  if (a.localOuLink) evento.location = a.localOuLink;
  return evento;
}

/** Cria o evento no calendário e devolve o id do Google, que fica em audiencias.google_event_id. */
export async function criarEventoAgenda(f: typeof fetch, token: string, calendarId: string, evento: EventoAgenda): Promise<string> {
  const resp = await f(`${URL_AGENDA}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(evento),
  });
  if (!resp.ok) throw new Error(`Google Agenda respondeu ${resp.status}`);
  const corpo = (await resp.json()) as { id?: string };
  if (!corpo.id) throw new Error("Google Agenda não devolveu o id do evento");
  return corpo.id;
}
