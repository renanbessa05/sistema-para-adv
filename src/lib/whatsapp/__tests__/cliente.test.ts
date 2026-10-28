import { describe, expect, it, vi } from "vitest";
import { componentesCorpo, criarClienteWhatsapp, normalizarDestinatario, type FetchImpl } from "../cliente";

const TOKEN = "EAAB-token-secreto";

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

function clienteCom(fetchImpl: FetchImpl) {
  return criarClienteWhatsapp({ accessToken: TOKEN, phoneNumberId: "PHONE_ID", fetchImpl });
}

describe("criarClienteWhatsapp", () => {
  it("enviarTexto monta a requisição correta e devolve o wamid", async () => {
    const fetchMock = vi.fn<FetchImpl>().mockResolvedValue(
      respostaJson({ messaging_product: "whatsapp", contacts: [{ input: "+5565999990000", wa_id: "5565999990000" }], messages: [{ id: "wamid.abc" }] }),
    );
    const resultado = await clienteCom(fetchMock).enviarTexto("+55 65 99999-0000", "Olá", { previewUrl: true });

    expect(resultado).toEqual({ ok: true, wamid: "wamid.abc" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v22.0/PHONE_ID/messages");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(init?.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5565999990000",
      type: "text",
      text: { preview_url: true, body: "Olá" },
    });
  });

  it("enviarTemplate usa pt_BR por padrão e envia os componentes", async () => {
    const fetchMock = vi.fn<FetchImpl>().mockResolvedValue(respostaJson({ messages: [{ id: "wamid.t" }] }));
    const resultado = await clienteCom(fetchMock).enviarTemplate("5565999990000", {
      nome: "alerta_prazo",
      componentes: componentesCorpo(["Contestação", "0001234-56.2026.8.11.0041", "em 3 dias", "02/11/2026"]),
    });

    expect(resultado).toEqual({ ok: true, wamid: "wamid.t" });
    const corpo = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(corpo.type).toBe("template");
    expect(corpo.template).toEqual({
      name: "alerta_prazo",
      language: { code: "pt_BR" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "Contestação" },
            { type: "text", text: "0001234-56.2026.8.11.0041" },
            { type: "text", text: "em 3 dias" },
            { type: "text", text: "02/11/2026" },
          ],
        },
      ],
    });
  });

  it("marcarComoLida devolve o próprio wamid quando a Graph API responde success", async () => {
    const fetchMock = vi.fn<FetchImpl>().mockResolvedValue(respostaJson({ success: true }));
    const resultado = await clienteCom(fetchMock).marcarComoLida("wamid.in");
    expect(resultado).toEqual({ ok: true, wamid: "wamid.in" });
    const corpo = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(corpo).toEqual({ messaging_product: "whatsapp", status: "read", message_id: "wamid.in" });
  });

  it("traduz erro da Graph API sem lançar e sem vazar o token", async () => {
    const fetchMock = vi.fn<FetchImpl>().mockResolvedValue(
      respostaJson(
        {
          error: {
            message: "(#131030) Recipient phone number not in allowed list",
            type: "OAuthException",
            code: 131030,
            error_subcode: 2655007,
            fbtrace_id: "Axyz",
          },
        },
        400,
      ),
    );
    const resultado = await clienteCom(fetchMock).enviarTexto("5565999990000", "oi");
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.erro.codigo).toBe(131030);
    expect(resultado.erro.mensagem).toContain("131030");
    expect(resultado.erro.detalhe).toMatchObject({ httpStatus: 400, error_subcode: 2655007, fbtrace_id: "Axyz" });
    expect(JSON.stringify(resultado)).not.toContain(TOKEN);
  });

  it("trata falha de rede como erro 'rede'", async () => {
    const fetchMock = vi.fn<FetchImpl>().mockRejectedValue(new TypeError("fetch failed"));
    const resultado = await clienteCom(fetchMock).enviarTexto("5565999990000", "oi");
    expect(resultado).toEqual({
      ok: false,
      erro: { codigo: "rede", mensagem: "Falha de rede ao chamar a Graph API: fetch failed" },
    });
  });

  it("trata HTTP de erro sem corpo JSON e resposta sem id", async () => {
    const semJson = vi.fn<FetchImpl>().mockResolvedValue(new Response("Bad Gateway", { status: 502 }));
    const r1 = await clienteCom(semJson).enviarTexto("5565999990000", "oi");
    expect(r1).toMatchObject({ ok: false, erro: { codigo: "http", detalhe: { httpStatus: 502 } } });

    const semId = vi.fn<FetchImpl>().mockResolvedValue(respostaJson({ messaging_product: "whatsapp" }));
    const r2 = await clienteCom(semId).enviarTexto("5565999990000", "oi");
    expect(r2).toMatchObject({ ok: false, erro: { codigo: "resposta_invalida" } });
  });

  it("aceita versão da Graph API e base alternativas", async () => {
    const fetchMock = vi.fn<FetchImpl>().mockResolvedValue(respostaJson({ messages: [{ id: "w" }] }));
    const cliente = criarClienteWhatsapp({
      accessToken: TOKEN,
      phoneNumberId: "P",
      fetchImpl: fetchMock,
      versaoGraph: "v23.0",
      baseUrl: "https://mock.local/",
    });
    await cliente.enviarTexto("1", "x");
    expect(fetchMock.mock.calls[0][0]).toBe("https://mock.local/v23.0/P/messages");
  });

  it("exige token e phoneNumberId", () => {
    expect(() => criarClienteWhatsapp({ accessToken: "", phoneNumberId: "P" })).toThrow();
    expect(() => criarClienteWhatsapp({ accessToken: "t", phoneNumberId: "" })).toThrow();
  });
});

describe("helpers", () => {
  it("componentesCorpo monta o body e devolve vazio sem valores", () => {
    expect(componentesCorpo([])).toEqual([]);
    expect(componentesCorpo(["a"])).toEqual([{ type: "body", parameters: [{ type: "text", text: "a" }] }]);
  });

  it("normalizarDestinatario deixa só dígitos", () => {
    expect(normalizarDestinatario("+55 (65) 99999-0000")).toBe("5565999990000");
  });
});
