import { describe, expect, it } from "vitest";
import { parsearSerieSgs, urlSgs, CODIGOS_SGS } from "../bcb";

describe("séries do BCB", () => {
  it("converte datas dd/mm/aaaa em competências e vírgula decimal em número", () => {
    expect(parsearSerieSgs([{ data: "01/03/2024", valor: "0,16" }, { data: "01/04/2024", valor: "-0,02" }])).toEqual({ "2024-03": 0.16, "2024-04": -0.02 });
  });

  it("recusa data e valor inválidos", () => {
    expect(() => parsearSerieSgs([{ data: "2024-03-01", valor: "1" }])).toThrow(/Data inválida/);
    expect(() => parsearSerieSgs([{ data: "01/03/2024", valor: "x" }])).toThrow(/Valor inválido/);
  });

  it("monta a URL do SGS sem barra dupla", () => {
    expect(urlSgs("https://api.bcb.gov.br/dados/serie/bcdata.sgs/", 188, "01/01/2020")).toBe("https://api.bcb.gov.br/dados/serie/bcdata.sgs.188/dados?formato=json&dataInicial=01/01/2020");
    expect(CODIGOS_SGS.selic).toBe(4390);
  });
});
