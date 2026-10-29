import { describe, expect, it } from "vitest";
import { destinoSeguro } from "./destino-seguro";

describe("destinoSeguro", () => {
  it("aceita caminhos internos e preserva query e hash", () => {
    expect(destinoSeguro("/prazos/abc?x=1#m")).toBe("/prazos/abc?x=1#m");
    expect(destinoSeguro("/configuracoes/seguranca")).toBe("/configuracoes/seguranca");
    expect(destinoSeguro("/")).toBe("/");
  });
  it("cai no padrão para qualquer coisa que saia da origem", () => {
    for (const ruim of ["//evil.com", "/\\evil.com", "/%5Cevil.com", "/%2Fevil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "/\\\\evil.com/x", " //evil.com", "/a\u0000b"]) {
      expect(destinoSeguro(ruim)).toBe("/hoje");
    }
  });
  it("cai no padrão para valores não textuais ou vazios", () => {
    expect(destinoSeguro(undefined)).toBe("/hoje");
    expect(destinoSeguro(null, "/x")).toBe("/x");
    expect(destinoSeguro("")).toBe("/hoje");
    expect(destinoSeguro(42)).toBe("/hoje");
  });
});
