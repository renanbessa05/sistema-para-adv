import {
  mensagemBrutaSchema,
  payloadWebhookSchema,
  statusBrutoSchema,
  STATUS_ENTREGA_CONHECIDOS,
  TIPOS_MENSAGEM_SUPORTADOS,
  type MensagemBruta,
  type MensagemRecebida,
  type StatusEntrega,
  type StatusEntregaConhecido,
  type TipoMensagemSuportado,
} from "./tipos";

export interface EventosWebhook {
  mensagens: MensagemRecebida[];
  statuses: StatusEntrega[];
  /** `metadata.phone_number_id` do primeiro `value` encontrado; null quando ausente. */
  phoneNumberId: string | null;
}

const VAZIO: EventosWebhook = { mensagens: [], statuses: [], phoneNumberId: null };

/** Converte epoch em segundos (string) para ISO 8601; usa `agora` se vier inválido. */
function epochParaIso(timestamp: string, agora: () => Date): string {
  const segundos = Number(timestamp);
  if (!Number.isFinite(segundos) || segundos <= 0) return agora().toISOString();
  return new Date(segundos * 1000).toISOString();
}

function ehTipoSuportado(tipo: string): tipo is TipoMensagemSuportado {
  return (TIPOS_MENSAGEM_SUPORTADOS as readonly string[]).includes(tipo);
}

function normalizarStatus(status: string): StatusEntregaConhecido | "outro" {
  return (STATUS_ENTREGA_CONHECIDOS as readonly string[]).includes(status)
    ? (status as StatusEntregaConhecido)
    : "outro";
}

/** Extrai o texto útil conforme o tipo da mensagem. */
export function extrairTexto(mensagem: MensagemBruta): string | null {
  switch (mensagem.type) {
    case "text":
      return mensagem.text?.body ?? null;
    case "button":
      return mensagem.button?.text ?? mensagem.button?.payload ?? null;
    case "interactive":
      return (
        mensagem.interactive?.button_reply?.title ??
        mensagem.interactive?.list_reply?.title ??
        null
      );
    case "image":
      return mensagem.image?.caption ?? null;
    case "document":
      return mensagem.document?.caption ?? mensagem.document?.filename ?? null;
    case "video":
      return mensagem.video?.caption ?? null;
    case "reaction":
      return mensagem.reaction?.emoji ?? null;
    case "location": {
      const partes = [mensagem.location?.name, mensagem.location?.address].filter(
        (p): p is string => typeof p === "string" && p.length > 0,
      );
      return partes.length > 0 ? partes.join(" - ") : null;
    }
    default:
      return null;
  }
}

/** Valida o payload inteiro; útil para o endpoint decidir se responde 200 ou 400. */
export function validarPayloadWebhook(payload: unknown) {
  return payloadWebhookSchema.safeParse(payload);
}

/**
 * Percorre o payload do webhook e devolve mensagens e statuses normalizados.
 *
 * Nunca lança: payload inválido devolve listas vazias; mensagens de tipos não
 * suportados (`unsupported`, `system`, `order`, `request_welcome`...) ou com
 * campos obrigatórios faltando são descartadas individualmente; mudanças com
 * `field` diferente de "messages" são ignoradas.
 */
export function extrairEventos(payload: unknown, agora: () => Date = () => new Date()): EventosWebhook {
  const resultado = payloadWebhookSchema.safeParse(payload);
  if (!resultado.success) return { ...VAZIO, mensagens: [], statuses: [] };

  const mensagens: MensagemRecebida[] = [];
  const statuses: StatusEntrega[] = [];
  let phoneNumberId: string | null = null;

  for (const entrada of resultado.data.entry) {
    for (const mudanca of entrada.changes ?? []) {
      if (mudanca.field !== "messages" || !mudanca.value) continue;
      const valor = mudanca.value;

      if (!phoneNumberId && valor.metadata?.phone_number_id) {
        phoneNumberId = valor.metadata.phone_number_id;
      }

      const nomes = new Map<string, string>();
      for (const contato of valor.contacts ?? []) {
        if (contato.profile?.name) nomes.set(contato.wa_id, contato.profile.name);
      }
      const primeiroNome = valor.contacts?.[0]?.profile?.name;

      for (const bruta of valor.messages ?? []) {
        const parse = mensagemBrutaSchema.safeParse(bruta);
        if (!parse.success) continue;
        const mensagem = parse.data;
        if (!ehTipoSuportado(mensagem.type)) continue;

        const de = mensagem.from.replace(/\D/g, "");
        if (!de) continue;

        // O wa_id pode divergir do `from` (ex.: nono dígito em números brasileiros);
        // quando há um só contato no lote, usa o nome dele como fallback.
        const nome =
          nomes.get(mensagem.from) ??
          nomes.get(de) ??
          ((valor.contacts?.length ?? 0) === 1 ? primeiroNome : undefined);

        mensagens.push({
          wamid: mensagem.id,
          de,
          telefone_e164: `+${de}`,
          ...(nome ? { nome } : {}),
          tipo: mensagem.type,
          texto: extrairTexto(mensagem),
          timestamp: epochParaIso(mensagem.timestamp, agora),
          payload_bruto: mensagem,
        });
      }

      for (const bruto of valor.statuses ?? []) {
        const parse = statusBrutoSchema.safeParse(bruto);
        if (!parse.success) continue;
        const status = parse.data;
        statuses.push({
          wamid: status.id,
          status: normalizarStatus(status.status),
          statusBruto: status.status,
          timestamp: epochParaIso(status.timestamp, agora),
          destinatario: status.recipient_id ? status.recipient_id.replace(/\D/g, "") : null,
          erros: (status.errors ?? []).map((erro) => ({
            codigo: typeof erro.code === "number" ? erro.code : null,
            titulo: erro.title ?? null,
            mensagem: erro.message ?? erro.error_data?.details ?? null,
          })),
          payload_bruto: status,
        });
      }
    }
  }

  return { mensagens, statuses, phoneNumberId };
}
