import { describe, expect, it } from "vitest";
import { DEFINICOES_INTEGRACAO, escolherSegredo, mensagemSemSegredo, origemDoSegredo, rotuloOrigem } from "../segredos";

describe("escolherSegredo", () => {
  it("Vault vence a variável de ambiente", () => {
    expect(escolherSegredo({ vault: "tok-vault", ambiente: "tok-env" })).toEqual({ valor: "tok-vault", origem: "vault", config: {} });
  });

  it("sem Vault, cai na variável de ambiente", () => {
    expect(escolherSegredo({ vault: null, ambiente: "tok-env" })).toEqual({ valor: "tok-env", origem: "ambiente", config: {} });
    expect(escolherSegredo({ vault: undefined, ambiente: "tok-env" }).origem).toBe("ambiente");
  });

  it("sem nenhum dos dois, valor e origem são null", () => {
    expect(escolherSegredo({ vault: null, ambiente: undefined })).toEqual({ valor: null, origem: null, config: {} });
  });

  it("string vazia ou só espaços conta como ausente, e o valor volta sem espaços nas pontas", () => {
    expect(escolherSegredo({ vault: "   ", ambiente: " tok-env " })).toEqual({ valor: "tok-env", origem: "ambiente", config: {} });
    expect(escolherSegredo({ vault: "", ambiente: "" }).valor).toBeNull();
  });

  it("config: banco primeiro, ambiente como fallback, chave a chave; chaves sem valor somem", () => {
    const r = escolherSegredo({
      vault: "tok",
      ambiente: null,
      configBanco: { phone_number_id: "111", outra: "", numero: 5 },
      configAmbiente: { phone_number_id: "999", waba_id: "777", vazia: undefined },
    });
    expect(r.config).toEqual({ phone_number_id: "111", waba_id: "777" });
  });

  it("config do ambiente é usada quando o banco não tem a chave", () => {
    const r = escolherSegredo({ vault: null, ambiente: "tok", configBanco: null, configAmbiente: { phone_number_id: "999" } });
    expect(r).toEqual({ valor: "tok", origem: "ambiente", config: { phone_number_id: "999" } });
  });
});

describe("origemDoSegredo e rótulos", () => {
  it("prioriza o Vault, depois o ambiente, depois nenhum", () => {
    expect(origemDoSegredo({ temVault: true, temAmbiente: true })).toBe("vault");
    expect(origemDoSegredo({ temVault: false, temAmbiente: true })).toBe("ambiente");
    expect(origemDoSegredo({ temVault: false, temAmbiente: false })).toBeNull();
  });

  it("rotula cada origem em português", () => {
    expect(rotuloOrigem("vault")).toBe("Vault");
    expect(rotuloOrigem("ambiente")).toBe("variável de ambiente");
    expect(rotuloOrigem(null)).toBe("nenhum");
  });

  it("a mensagem de ausência cita a tela e a variável de ambiente certa", () => {
    expect(mensagemSemSegredo("datajud")).toContain("DATAJUD_API_KEY");
    expect(mensagemSemSegredo("whatsapp")).toContain("WHATSAPP_ACCESS_TOKEN");
    expect(mensagemSemSegredo("whatsapp")).toContain("Integrações");
    expect(DEFINICOES_INTEGRACAO.whatsapp.variaveisConfig.phone_number_id).toBe("WHATSAPP_PHONE_NUMBER_ID");
  });
});
