import { describe, expect, it } from "vitest";
import { naoExplicada, semanasConsecutivasLimpas, sextaDeReferencia, ultimaSextaConcluida } from "./divergencias";

// Outubro/novembro de 2026: sextas em 23/10, 30/10, 06/11, 13/11, 20/11
describe("sextaDeReferencia", () => {
  it("de segunda a sexta aponta para a sexta da própria semana", () => {
    expect(sextaDeReferencia("2026-10-26")).toBe("2026-10-30"); // segunda
    expect(sextaDeReferencia("2026-10-28")).toBe("2026-10-30"); // quarta
    expect(sextaDeReferencia("2026-10-30")).toBe("2026-10-30"); // sexta
  });
  it("no fim de semana aponta para a sexta que acabou de passar", () => {
    expect(sextaDeReferencia("2026-10-31")).toBe("2026-10-30"); // sábado
    expect(sextaDeReferencia("2026-11-01")).toBe("2026-10-30"); // domingo
  });
});

describe("ultimaSextaConcluida", () => {
  it("é hoje na sexta e a sexta anterior nos demais dias", () => {
    expect(ultimaSextaConcluida("2026-10-30")).toBe("2026-10-30");
    expect(ultimaSextaConcluida("2026-10-31")).toBe("2026-10-30");
    expect(ultimaSextaConcluida("2026-11-01")).toBe("2026-10-30");
    expect(ultimaSextaConcluida("2026-11-02")).toBe("2026-10-30");
    expect(ultimaSextaConcluida("2026-11-05")).toBe("2026-10-30");
  });
});

describe("semanasConsecutivasLimpas", () => {
  const explicada = (semana: string) => ({ semana, causa: "feriado municipal faltando no calendário" });
  const semCausa = (semana: string) => ({ semana, causa: null });

  it("sem registro nenhum, zero: antes da primeira conferência não há o que provar", () => {
    expect(semanasConsecutivasLimpas([], "2026-11-20")).toBe(0);
  });

  it("conta semanas a partir da primeira registrada, inclusive as sem registro, até a última sexta concluída", () => {
    // Primeira conferência em 23/10, explicada; 30/10 e 06/11 sem registro; hoje é sexta 13/11
    expect(semanasConsecutivasLimpas([explicada("2026-10-23")], "2026-11-13")).toBe(4);
    // Na quinta 12/11 a semana de 13/11 ainda não conta
    expect(semanasConsecutivasLimpas([explicada("2026-10-23")], "2026-11-12")).toBe(3);
  });

  it("divergência sem causa zera a contagem naquela semana", () => {
    const lista = [explicada("2026-10-23"), semCausa("2026-10-30"), explicada("2026-11-06")];
    expect(semanasConsecutivasLimpas(lista, "2026-11-13")).toBe(2); // 13/11 e 06/11
    expect(semanasConsecutivasLimpas([semCausa("2026-11-13")], "2026-11-13")).toBe(0);
    expect(semanasConsecutivasLimpas([{ semana: "2026-11-13", causa: "   " }], "2026-11-13")).toBe(0);
  });

  it("naoExplicada: causa nula ou só espaços", () => {
    expect(naoExplicada({ causa: null })).toBe(true);
    expect(naoExplicada({ causa: " " })).toBe(true);
    expect(naoExplicada({ causa: "classificação errada" })).toBe(false);
  });
});
