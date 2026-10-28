import { describe, expect, it } from "vitest";
import { adicionarDias, anoDe, compararDatas, diaDaSemana, diferencaEmDias, ehFimDeSemana, formatarBr, hojeNoFuso, nomeDiaSemana, validarDataISO } from "../datas";

describe("datas", () => {
  it("valida o formato e a existência da data", () => {
    expect(validarDataISO("2026-03-06")).toBe("2026-03-06");
    expect(() => validarDataISO("06/03/2026")).toThrow(/YYYY-MM-DD/);
    expect(() => validarDataISO("2026-02-30")).toThrow(/inexistente/);
  });

  it("soma e subtrai dias atravessando mês e ano", () => {
    expect(adicionarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(adicionarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(adicionarDias("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("sabe o dia da semana e o fim de semana", () => {
    expect(diaDaSemana("2026-03-06")).toBe(5); // sexta
    expect(nomeDiaSemana("2026-03-06")).toBe("sexta-feira");
    expect(ehFimDeSemana("2026-03-07")).toBe(true);
    expect(ehFimDeSemana("2026-03-08")).toBe(true);
    expect(ehFimDeSemana("2026-03-09")).toBe(false);
  });

  it("compara, calcula diferença e extrai o ano", () => {
    expect(compararDatas("2026-01-01", "2026-01-02")).toBe(-1);
    expect(compararDatas("2026-01-02", "2026-01-01")).toBe(1);
    expect(compararDatas("2026-01-01", "2026-01-01")).toBe(0);
    expect(diferencaEmDias("2026-12-17", "2027-01-15")).toBe(29);
    expect(anoDe("2027-01-15")).toBe(2027);
  });

  it("'hoje' respeita o fuso de Cuiabá (UTC-4, sem horário de verão)", () => {
    expect(hojeNoFuso("America/Cuiaba", new Date("2026-10-30T02:30:00Z"))).toBe("2026-10-29");
    expect(hojeNoFuso("America/Cuiaba", new Date("2026-10-30T04:00:00Z"))).toBe("2026-10-30");
    expect(hojeNoFuso("UTC", new Date("2026-10-30T02:30:00Z"))).toBe("2026-10-30");
    expect(hojeNoFuso("America/Cuiaba")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("formata em DD/MM/AAAA", () => {
    expect(formatarBr("2026-03-06")).toBe("06/03/2026");
  });
});
