import { describe, expect, it } from "vitest";
import { horaLocal, instanteDeFormulario } from "../datas";

describe("datas de audiência", () => {
  it("converte o horário do escritório (Cuiabá, UTC-4) no instante real", () => {
    expect(instanteDeFormulario("2026-11-03T14:30", "America/Cuiaba").toISOString()).toBe("2026-11-03T18:30:00.000Z");
  });

  it("recusa formato fora de AAAA-MM-DDTHH:MM", () => {
    expect(() => instanteDeFormulario("03/11/2026 14:30", "America/Cuiaba")).toThrow(/AAAA-MM-DDTHH:MM/);
  });

  it("mostra a hora no fuso do escritório", () => {
    expect(horaLocal(new Date("2026-11-03T18:30:00Z"), "America/Cuiaba")).toBe("14:30");
  });
});
