import { describe, expect, it } from "vitest";
import { competenciaAposDatajud, lerValorMonetario } from "./processos";

describe("competenciaAposDatajud", () => {
  it("grava a dedução do DataJud enquanto a equipe não ajustou a competência", () => {
    expect(competenciaAposDatajud(false, "juizado_especial")).toBe("juizado_especial");
    expect(competenciaAposDatajud(false, "segundo_grau")).toBe("segundo_grau");
    expect(competenciaAposDatajud(false, "vara_comum")).toBe("vara_comum");
  });

  it("respeita qualquer ajuste manual, inclusive vara comum, e não grava sem dedução", () => {
    expect(competenciaAposDatajud(true, "juizado_especial")).toBeUndefined();
    expect(competenciaAposDatajud(true, "vara_comum")).toBeUndefined();
    expect(competenciaAposDatajud(false, null)).toBeUndefined();
    expect(competenciaAposDatajud(false, undefined)).toBeUndefined();
  });
});

describe("lerValorMonetario", () => {
  it("aceita formato brasileiro e ponto decimal", () => {
    expect(lerValorMonetario("1.234,56")).toBe(1234.56);
    expect(lerValorMonetario("1234.56")).toBe(1234.56);
    expect(lerValorMonetario("")).toBeNull();
  });
});
