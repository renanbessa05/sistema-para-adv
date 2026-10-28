import { z } from "zod";

/**
 * Schemas Zod permissivos para o payload do webhook da WhatsApp Cloud API.
 *
 * A Meta acrescenta campos sem aviso, então todos os objetos são `looseObject`
 * (campos desconhecidos são preservados) e só o mínimo necessário é exigido.
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */

export const erroGraphSchema = z.looseObject({
  code: z.number().optional(),
  title: z.string().optional(),
  message: z.string().optional(),
  error_data: z.looseObject({ details: z.string().optional() }).optional(),
});

export const perfilContatoSchema = z.looseObject({
  profile: z.looseObject({ name: z.string().optional() }).optional(),
  wa_id: z.string(),
});

export const mensagemBrutaSchema = z.looseObject({
  from: z.string(),
  id: z.string(),
  /** Epoch em segundos, como string. */
  timestamp: z.string(),
  type: z.string(),
  text: z.looseObject({ body: z.string() }).optional(),
  /** Resposta a botão de template (quick reply). */
  button: z.looseObject({ text: z.string().optional(), payload: z.string().optional() }).optional(),
  /** Resposta a mensagem interativa (botões ou lista). */
  interactive: z
    .looseObject({
      type: z.string().optional(),
      button_reply: z.looseObject({ id: z.string().optional(), title: z.string().optional() }).optional(),
      list_reply: z
        .looseObject({ id: z.string().optional(), title: z.string().optional(), description: z.string().optional() })
        .optional(),
    })
    .optional(),
  image: z.looseObject({ id: z.string().optional(), mime_type: z.string().optional(), caption: z.string().optional() }).optional(),
  document: z
    .looseObject({ id: z.string().optional(), mime_type: z.string().optional(), filename: z.string().optional(), caption: z.string().optional() })
    .optional(),
  audio: z.looseObject({ id: z.string().optional(), mime_type: z.string().optional() }).optional(),
  video: z.looseObject({ id: z.string().optional(), mime_type: z.string().optional(), caption: z.string().optional() }).optional(),
  sticker: z.looseObject({ id: z.string().optional(), mime_type: z.string().optional() }).optional(),
  location: z.looseObject({ latitude: z.number().optional(), longitude: z.number().optional(), name: z.string().optional(), address: z.string().optional() }).optional(),
  reaction: z.looseObject({ message_id: z.string().optional(), emoji: z.string().optional() }).optional(),
  context: z.looseObject({ from: z.string().optional(), id: z.string().optional() }).optional(),
  errors: z.array(erroGraphSchema).optional(),
});

export const statusBrutoSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  timestamp: z.string(),
  recipient_id: z.string().optional(),
  conversation: z.looseObject({ id: z.string().optional(), origin: z.looseObject({ type: z.string().optional() }).optional() }).optional(),
  pricing: z.looseObject({ billable: z.boolean().optional(), category: z.string().optional(), pricing_model: z.string().optional() }).optional(),
  errors: z.array(erroGraphSchema).optional(),
});

export const valorMudancaSchema = z.looseObject({
  messaging_product: z.string().optional(),
  metadata: z
    .looseObject({
      display_phone_number: z.string().optional(),
      phone_number_id: z.string().optional(),
    })
    .optional(),
  contacts: z.array(perfilContatoSchema).optional(),
  /** Cada item é validado individualmente em parse-webhook.ts para não derrubar o lote. */
  messages: z.array(z.unknown()).optional(),
  statuses: z.array(z.unknown()).optional(),
  errors: z.array(erroGraphSchema).optional(),
});

export const mudancaSchema = z.looseObject({
  field: z.string(),
  value: valorMudancaSchema.optional(),
});

export const entradaSchema = z.looseObject({
  id: z.string().optional(),
  changes: z.array(mudancaSchema).optional(),
});

export const payloadWebhookSchema = z.looseObject({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(entradaSchema),
});

export type PayloadWebhook = z.infer<typeof payloadWebhookSchema>;
export type MensagemBruta = z.infer<typeof mensagemBrutaSchema>;
export type StatusBruto = z.infer<typeof statusBrutoSchema>;
export type ErroGraph = z.infer<typeof erroGraphSchema>;

/** Tipos de mensagem que a inbox trata (os demais são descartados em silêncio). */
export const TIPOS_MENSAGEM_SUPORTADOS = [
  "text",
  "button",
  "interactive",
  "image",
  "document",
  "audio",
  "video",
  "sticker",
  "location",
  "reaction",
] as const;
export type TipoMensagemSuportado = (typeof TIPOS_MENSAGEM_SUPORTADOS)[number];

/** Mensagem recebida, normalizada para a inbox. */
export interface MensagemRecebida {
  /** Identificador da Meta; chave de idempotência da inbox (a Meta reenvia por até 7 dias). */
  wamid: string;
  /** Telefone do remetente em E.164 sem o "+", como vem no campo `from`. */
  de: string;
  /** Telefone do remetente em E.164 com o "+". */
  telefone_e164: string;
  /** Nome do perfil do WhatsApp do remetente, quando a Meta envia `contacts`. */
  nome?: string;
  tipo: TipoMensagemSuportado;
  /**
   * Texto útil: corpo de `text`, título do botão/resposta interativa, legenda de
   * mídia; null quando a mensagem não carrega texto.
   */
  texto: string | null;
  /** Instante do envio em ISO 8601 (convertido do epoch em segundos). */
  timestamp: string;
  /** Mensagem exatamente como veio no webhook, para auditoria. */
  payload_bruto: MensagemBruta;
}

export const STATUS_ENTREGA_CONHECIDOS = ["sent", "delivered", "read", "failed"] as const;
export type StatusEntregaConhecido = (typeof STATUS_ENTREGA_CONHECIDOS)[number];

/** Atualização de status de uma mensagem enviada pelo sistema. */
export interface StatusEntrega {
  /** wamid da mensagem enviada a que o status se refere. */
  wamid: string;
  /** Status normalizado; "outro" para valores fora da lista conhecida (ex.: "deleted", "warning"). */
  status: StatusEntregaConhecido | "outro";
  /** Valor original enviado pela Meta. */
  statusBruto: string;
  /** Instante do evento em ISO 8601. */
  timestamp: string;
  /** Telefone do destinatário em E.164 sem "+". */
  destinatario: string | null;
  /** Erros reportados pela Meta (relevante quando status = failed). */
  erros: Array<{ codigo: number | null; titulo: string | null; mensagem: string | null }>;
  payload_bruto: StatusBruto;
}
