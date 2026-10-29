import { describe, expect, it } from "vitest";
import { rotuloSolicitacao, validarSolicitacao } from "../solicitacoes";

describe("solicitações dos titulares", () => {
  it("rotula tipos conhecidos e devolve o próprio valor para desconhecidos", () => {
    expect(rotuloSolicitacao("eliminacao")).toBe("Eliminação (anonimização)");
    expect(rotuloSolicitacao("outro")).toBe("outro");
  });

  it("valida tipo, nome e prazo", () => {
    expect(validarSolicitacao({ tipo: "acesso", titularNome: "Ana", prazo: "2026-11-15" })).toBeNull();
    expect(validarSolicitacao({ tipo: "xx", titularNome: "Ana", prazo: "2026-11-15" })).toMatch(/Tipo/);
    expect(validarSolicitacao({ tipo: "acesso", titularNome: "  ", prazo: "2026-11-15" })).toMatch(/nome/);
    expect(validarSolicitacao({ tipo: "acesso", titularNome: "Ana", prazo: "15/11/2026" })).toMatch(/prazo/);
  });
});
