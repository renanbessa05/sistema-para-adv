import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { responderVerificacaoWebhook, verificarAssinatura } from "../assinatura";

const SEGREDO = "segredo-do-app";
const CORPO = '{"object":"whatsapp_business_account","entry":[]}';
const assinar = (corpo: string | Buffer, segredo = SEGREDO) =>
  `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;

describe("verificarAssinatura", () => {
  it("aceita assinatura correta sobre o corpo em string", () => {
    expect(verificarAssinatura({ corpoBruto: CORPO, cabecalho: assinar(CORPO), appSecret: SEGREDO })).toBe(true);
  });

  it("aceita corpo em Buffer e hex em maiúsculas", () => {
    const corpo = Buffer.from('{"a":"ção"}', "utf8");
    const cabecalho = "sha256=" + assinar(corpo).slice(7).toUpperCase();
    expect(verificarAssinatura({ corpoBruto: corpo, cabecalho, appSecret: SEGREDO })).toBe(true);
  });

  it("rejeita segredo errado", () => {
    expect(verificarAssinatura({ corpoBruto: CORPO, cabecalho: assinar(CORPO, "outro"), appSecret: SEGREDO })).toBe(false);
  });

  it("rejeita corpo alterado", () => {
    expect(verificarAssinatura({ corpoBruto: CORPO + " ", cabecalho: assinar(CORPO), appSecret: SEGREDO })).toBe(false);
  });

  it("rejeita cabeçalho ausente ou malformado sem lançar", () => {
    expect(verificarAssinatura({ corpoBruto: CORPO, cabecalho: null, appSecret: SEGREDO })).toBe(false);
    expect(verificarAssinatura({ corpoBruto: CORPO, cabecalho: "", appSecret: SEGREDO })).toBe(false);
    expect(verificarAssinatura({ corpoBruto: CORPO, cabecalho: "sha1=abc", appSecret: SEGREDO })).toBe(false);
    expect(verificarAssinatura({ corpoBruto: CORPO, cabecalho: "sha256=abc", appSecret: SEGREDO })).toBe(false);
    expect(verificarAssinatura({ corpoBruto: CORPO, cabecalho: "sha256=zz".padEnd(71, "z"), appSecret: SEGREDO })).toBe(false);
  });

  it("rejeita app secret vazio", () => {
    expect(verificarAssinatura({ corpoBruto: CORPO, cabecalho: assinar(CORPO, ""), appSecret: "" })).toBe(false);
  });
});

describe("responderVerificacaoWebhook", () => {
  it("devolve o challenge quando modo e token conferem", () => {
    expect(
      responderVerificacaoWebhook({
        hubMode: "subscribe",
        hubVerifyToken: "tok",
        hubChallenge: "12345",
        verifyTokenEsperado: "tok",
      }),
    ).toEqual({ ok: true, challenge: "12345" });
  });

  it("recusa modo diferente de subscribe, token errado ou challenge ausente", () => {
    const base = { hubMode: "subscribe", hubVerifyToken: "tok", hubChallenge: "1", verifyTokenEsperado: "tok" };
    expect(responderVerificacaoWebhook({ ...base, hubMode: "unsubscribe" })).toEqual({ ok: false });
    expect(responderVerificacaoWebhook({ ...base, hubVerifyToken: "errado" })).toEqual({ ok: false });
    expect(responderVerificacaoWebhook({ ...base, hubVerifyToken: null })).toEqual({ ok: false });
    expect(responderVerificacaoWebhook({ ...base, hubChallenge: null })).toEqual({ ok: false });
    expect(responderVerificacaoWebhook({ ...base, verifyTokenEsperado: "" })).toEqual({ ok: false });
  });
});
