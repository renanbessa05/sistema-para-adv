import { describe, expect, it } from "vitest";
import { casaCitacao, conferirCitacoes, extrairCitacoes } from "../citacoes";

describe("citações de jurisprudência", () => {
  it("extrai citações numeradas sem repetição e com espaços normalizados", () => {
    const texto = "Conforme REsp 1.234.567/MT e a Súmula 7/STJ, e REsp 1.234.567/MT de novo. Também REsp   999.";
    expect(extrairCitacoes(texto)).toEqual(["REsp 1.234.567", "Súmula 7", "REsp 999"]);
  });

  it("confirma só o que tem registro e aponta o resto como sem registro", () => {
    const texto = "Conforme REsp 1.234.567/MT e a Súmula 7/STJ.";
    const r = conferirCitacoes(texto, ["REsp 1.234.567/MT"]);
    expect(r.confirmadas).toEqual(["REsp 1.234.567"]);
    expect(r.semRegistro).toEqual(["Súmula 7"]);
  });

  it("sem nenhuma citação, tudo fica vazio", () => {
    expect(conferirCitacoes("texto sem precedentes", [])).toEqual({ citadas: [], confirmadas: [], semRegistro: [] });
  });

  it("casa por prefixo de sufixo, mas não confunde número com outro número", () => {
    expect(casaCitacao("Súmula 7", "Súmula 7/STJ")).toBe(true);
    expect(casaCitacao("Súmula 7", "Súmula 70/STJ")).toBe(false);
    expect(casaCitacao("REsp 1.234.567", "REsp 1.234.567/MT")).toBe(true);
    expect(casaCitacao("REsp 1.234.567", "REsp 1.234.567")).toBe(true);
  });
});
