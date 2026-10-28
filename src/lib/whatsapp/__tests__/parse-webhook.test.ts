import { describe, expect, it } from "vitest";
import { extrairEventos, validarPayloadWebhook } from "../parse-webhook";

const METADATA = { display_phone_number: "556530000000", phone_number_id: "PHONE_ID" };

function payloadCom(value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA_ID", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: METADATA, ...value } }] }],
  };
}

describe("extrairEventos", () => {
  it("normaliza mensagem de texto com nome do contato e timestamp ISO", () => {
    const eventos = extrairEventos(
      payloadCom({
        contacts: [{ profile: { name: "Ana" }, wa_id: "5565999990000" }],
        messages: [{ from: "5565999990000", id: "wamid.1", timestamp: "1761822000", type: "text", text: { body: "resumo do dia" }, extra: 1 }],
      }),
    );
    expect(eventos.phoneNumberId).toBe("PHONE_ID");
    expect(eventos.statuses).toEqual([]);
    expect(eventos.mensagens).toHaveLength(1);
    const m = eventos.mensagens[0];
    expect(m).toMatchObject({
      wamid: "wamid.1",
      de: "5565999990000",
      telefone_e164: "+5565999990000",
      nome: "Ana",
      tipo: "text",
      texto: "resumo do dia",
      timestamp: new Date(1761822000 * 1000).toISOString(),
    });
    expect(m.payload_bruto).toMatchObject({ id: "wamid.1", extra: 1 });
  });

  it("extrai título de botão e de respostas interativas", () => {
    const eventos = extrairEventos(
      payloadCom({
        messages: [
          { from: "5565999990000", id: "w1", timestamp: "1", type: "button", button: { text: "Confirmar", payload: "CONFIRMAR" } },
          { from: "5565999990000", id: "w2", timestamp: "1", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "sim", title: "Sim" } } },
          { from: "5565999990000", id: "w3", timestamp: "1", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "p1", title: "Processo 1" } } },
        ],
      }),
    );
    expect(eventos.mensagens.map((m) => m.texto)).toEqual(["Confirmar", "Sim", "Processo 1"]);
  });

  it("mantém mídia com legenda ou texto nulo e descarta tipos não suportados", () => {
    const eventos = extrairEventos(
      payloadCom({
        messages: [
          { from: "5565999990000", id: "w1", timestamp: "1", type: "image", image: { id: "img", mime_type: "image/jpeg", caption: "procuração" } },
          { from: "5565999990000", id: "w2", timestamp: "1", type: "audio", audio: { id: "aud", mime_type: "audio/ogg" } },
          { from: "5565999990000", id: "w3", timestamp: "1", type: "unsupported", errors: [{ code: 131051, title: "Unsupported message type" }] },
          { from: "5565999990000", id: "w4", timestamp: "1", type: "system", system: { body: "trocou de número" } },
          { from: "5565999990000", id: "w5", timestamp: "1", type: "request_welcome" },
        ],
      }),
    );
    expect(eventos.mensagens.map((m) => [m.wamid, m.tipo, m.texto])).toEqual([
      ["w1", "image", "procuração"],
      ["w2", "audio", null],
    ]);
  });

  it("descarta mensagem sem campos obrigatórios sem derrubar o lote", () => {
    const eventos = extrairEventos(
      payloadCom({
        messages: [
          { id: "sem-from", timestamp: "1", type: "text", text: { body: "x" } },
          { from: "5565999990000", id: "ok", timestamp: "1", type: "text", text: { body: "ok" } },
        ],
      }),
    );
    expect(eventos.mensagens.map((m) => m.wamid)).toEqual(["ok"]);
  });

  it("normaliza statuses, inclusive failed com erros e status desconhecido", () => {
    const eventos = extrairEventos(
      payloadCom({
        statuses: [
          { id: "wamid.out1", status: "delivered", timestamp: "1761822000", recipient_id: "5565999990000", conversation: { id: "c" }, pricing: { billable: true } },
          { id: "wamid.out1", status: "failed", timestamp: "1761822001", recipient_id: "5565999990000", errors: [{ code: 131026, title: "Message undeliverable", message: "Message Undeliverable.", error_data: { details: "destinatário sem WhatsApp" } }] },
          { id: "wamid.out2", status: "deleted", timestamp: "1761822002" },
        ],
      }),
    );
    expect(eventos.statuses).toHaveLength(3);
    expect(eventos.statuses[0]).toMatchObject({ wamid: "wamid.out1", status: "delivered", destinatario: "5565999990000", erros: [] });
    expect(eventos.statuses[1]).toMatchObject({
      status: "failed",
      erros: [{ codigo: 131026, titulo: "Message undeliverable", mensagem: "Message Undeliverable." }],
    });
    expect(eventos.statuses[2]).toMatchObject({ status: "outro", statusBruto: "deleted", destinatario: null });
  });

  it("ignora mudanças de outros campos e payloads inválidos sem lançar", () => {
    expect(extrairEventos(null)).toEqual({ mensagens: [], statuses: [], phoneNumberId: null });
    expect(extrairEventos({ object: "page", entry: [] })).toEqual({ mensagens: [], statuses: [], phoneNumberId: null });
    expect(extrairEventos("texto")).toEqual({ mensagens: [], statuses: [], phoneNumberId: null });

    const outroCampo = {
      object: "whatsapp_business_account",
      entry: [{ id: "x", changes: [{ field: "account_update", value: { event: "VERIFIED_ACCOUNT" } }] }],
    };
    expect(extrairEventos(outroCampo)).toEqual({ mensagens: [], statuses: [], phoneNumberId: null });
  });

  it("usa a hora atual quando o timestamp vem inválido", () => {
    const agora = new Date("2026-10-28T12:00:00Z");
    const eventos = extrairEventos(
      payloadCom({ messages: [{ from: "5565999990000", id: "w1", timestamp: "abc", type: "text", text: { body: "oi" } }] }),
      () => agora,
    );
    expect(eventos.mensagens[0].timestamp).toBe(agora.toISOString());
  });

  it("validarPayloadWebhook distingue payload válido de inválido", () => {
    expect(validarPayloadWebhook(payloadCom({})).success).toBe(true);
    expect(validarPayloadWebhook({ object: "whatsapp_business_account" }).success).toBe(false);
  });
});
