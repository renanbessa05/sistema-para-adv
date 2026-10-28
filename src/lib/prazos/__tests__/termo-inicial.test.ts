import { describe, expect, it } from "vitest";
import { calcularTermoInicial } from "../termo-inicial";
import { calendarioCuiaba } from "./fixture-calendario";

describe("termo inicial", () => {
  const cal = calendarioCuiaba();

  it("DJEN: publicação no 1º dia útil seguinte e contagem no dia útil seguinte à publicação", () => {
    const t = calcularTermoInicial({ origem: "publicacao_djen", dataDisponibilizacao: "2026-03-06" }, cal);
    expect(t.dataPublicacao).toBe("2026-03-09");
    expect(t.dataInicioContagem).toBe("2026-03-10");
    expect(t.fundamentos.join(" ")).toMatch(/art\. 4º, §3º/);
    expect(t.fundamentos.join(" ")).toMatch(/art\. 4º, §4º/);
  });

  it("disponibilização na véspera de feriado e fim de semana empurra a publicação", () => {
    const t = calcularTermoInicial({ origem: "publicacao_djen", dataDisponibilizacao: "2026-04-02" }, cal);
    expect(t.dataPublicacao).toBe("2026-04-06");
    expect(t.dataInicioContagem).toBe("2026-04-07");
  });

  it("aceita a data de publicação direta (lançamento manual)", () => {
    const t = calcularTermoInicial({ origem: "manual", dataPublicacao: "2026-03-09" }, cal);
    expect(t.dataDisponibilizacao).toBeNull();
    expect(t.dataPublicacao).toBe("2026-03-09");
    expect(t.dataInicioContagem).toBe("2026-03-10");
    expect(t.fundamentos.join(" ")).toMatch(/224, caput/);
  });

  it("aceita o dia 1 informado diretamente", () => {
    const t = calcularTermoInicial({ origem: "audiencia", dataInicioContagem: "2026-03-10", dataPublicacao: "2026-03-09" }, cal);
    expect(t.dataInicioContagem).toBe("2026-03-10");
    expect(t.dataPublicacao).toBe("2026-03-09");
    expect(t.dataDisponibilizacao).toBeNull();
    expect(t.fundamentos[0]).toMatch(/informado diretamente/);
  });

  it("avisa sobre a regra própria da citação eletrônica", () => {
    const t = calcularTermoInicial({ origem: "citacao_eletronica", dataPublicacao: "2026-03-09" }, cal);
    expect(t.avisos.join(" ")).toMatch(/231, IX/);
  });

  it("exige alguma data", () => {
    expect(() => calcularTermoInicial({ origem: "manual" }, cal)).toThrow(/Informe/);
  });

  it("prazo material ignora o recesso ao achar a publicação", () => {
    const t = calcularTermoInicial({ origem: "publicacao_djen", dataDisponibilizacao: "2026-12-22" }, cal, false);
    expect(t.dataPublicacao).toBe("2026-12-23");
  });
});
