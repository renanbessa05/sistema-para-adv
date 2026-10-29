/**
 * Sanitização de eventos de erro antes de sair do servidor (usada como `beforeSend`).
 * Regra: nenhum dado de processo, cliente, documento ou mensagem vai ao Sentry. Só tipo do erro, nível e
 * rota genérica. O pacote @sentry/nextjs NÃO está instalado neste lote (a confirmar): este código fica pronto
 * e desligado sem SENTRY_DSN. Ver docs/adr/0017-operacao-backup-e-status.md.
 */

/** Campos do evento Sentry que podem carregar conteúdo do usuário. Todos são removidos. */
const CAMPOS_REMOVIDOS = ["request", "user", "extra", "breadcrumbs", "contexts", "attachments", "message", "server_name"] as const;

export interface EventoSentryMinimo {
  level?: string;
  tags?: Record<string, unknown>;
  exception?: { values?: { type?: string; value?: string; stacktrace?: unknown }[] };
  [chave: string]: unknown;
}

/** Retorna o evento sem conteúdo, ou null quando não há DSN (integração desligada). */
export function sanitizarEventoSentry(evento: EventoSentryMinimo, dsn: string | undefined): EventoSentryMinimo | null {
  if (!dsn) return null;
  const limpo: EventoSentryMinimo = { ...evento };
  for (const campo of CAMPOS_REMOVIDOS) delete limpo[campo];
  if (limpo.exception?.values) {
    // Mantém só o nome do tipo de erro. A mensagem pode trazer número de processo ou nome de cliente.
    limpo.exception = {
      values: limpo.exception.values.map((v) => ({ type: v.type ?? "Error" })),
    };
  }
  limpo.tags = { app: "sistema-para-adv" };
  return limpo;
}

/** A integração só liga com a chave presente. */
export function sentryAtivo(dsn: string | undefined): boolean {
  return Boolean(dsn && dsn.trim().startsWith("https://"));
}
