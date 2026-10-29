import { describe, expect, it } from "vitest";
import { validarEscritorio, validarResponsavel } from "./onboarding";

describe("validarEscritorio", () => {
  it("exige nome com pelo menos 2 caracteres", () => {
    expect(validarEscritorio({ nome: "A" })).not.toBeNull();
    expect(validarEscritorio({ nome: "Silva & Advogados" })).toBeNull();
  });
  it("aceita CNPJ com máscara com 14 dígitos e recusa outro tamanho", () => {
    expect(validarEscritorio({ nome: "Escritório", cnpj: "00.000.000/0001-91" })).toBeNull();
    expect(validarEscritorio({ nome: "Escritório", cnpj: "123" })).not.toBeNull();
    expect(validarEscritorio({ nome: "Escritório", cnpj: "" })).toBeNull();
  });
});

describe("validarResponsavel", () => {
  it("exige nome completo", () => {
    expect(validarResponsavel({ nomeCompleto: "Ana" })).not.toBeNull();
    expect(validarResponsavel({ nomeCompleto: "Ana Souza" })).toBeNull();
  });
  it("aceita UF da OAB conhecida, em qualquer caixa, ou em branco", () => {
    expect(validarResponsavel({ nomeCompleto: "Ana Souza", oabUf: "mt" })).toBeNull();
    expect(validarResponsavel({ nomeCompleto: "Ana Souza", oabUf: "" })).toBeNull();
    expect(validarResponsavel({ nomeCompleto: "Ana Souza", oabUf: "XX" })).not.toBeNull();
  });
});
