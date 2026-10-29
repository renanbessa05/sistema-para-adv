import { describe, expect, it } from "vitest";
import { competenciaAposDatajud, lerValorMonetario } from "./processos";

describe("competenciaAposDatajud", () => {
  it("substitui só o padrão vara_comum pela dedução do DataJud", () => {
    expect(competenciaAposDatajud("vara_comum", "juizado_especial")).toBe("juizado_especial");
    expect(competenciaAposDatajud("vara_comum", "segundo_grau")).toBe("segundo_grau");
    expect(competenciaAposDatajud(null, "juizado_especial")).toBe("juizado_especial");
    expect(competenciaAposDatajud(undefined, "segundo_grau")).toBe("segundo_grau");
  });

  it("não apaga ajuste manual da equipe nem grava quando a dedução é o próprio padrão", () => {
    expect(competenciaAposDatajud("juizado_especial", "vara_comum")).toBeUndefined();
    expect(competenciaAposDatajud("outra", "juizado_especial")).toBeUndefined();
    expect(competenciaAposDatajud("segundo_grau", "juizado_especial")).toBeUndefined();
    expect(competenciaAposDatajud("vara_comum", "vara_comum")).toBeUndefined();
    expect(competenciaAposDatajud("vara_comum", null)).toBeUndefined();
  });
});

describe("lerValorMonetario", () => {
  it("aceita formato brasileiro e ponto decimal", () => {
    expect(lerValorMonetario("1.234,56")).toBe(1234.56);
    expect(lerValorMonetario("1234.56")).toBe(1234.56);
    expect(lerValorMonetario("")).toBeNull();
  });
});
