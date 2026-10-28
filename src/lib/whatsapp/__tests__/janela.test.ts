import { describe, expect, it } from "vitest";
import { dentroDaJanela24h, JANELA_24H_MS, restanteNaJanelaMs } from "../janela";

const AGORA = new Date("2026-10-28T15:00:00Z");

describe("dentroDaJanela24h", () => {
  it("false quando o usuário nunca escreveu", () => {
    expect(dentroDaJanela24h(null, AGORA)).toBe(false);
    expect(dentroDaJanela24h(undefined, AGORA)).toBe(false);
    expect(dentroDaJanela24h("", AGORA)).toBe(false);
  });

  it("true dentro das 24 h, false a partir do limite", () => {
    expect(dentroDaJanela24h("2026-10-28T14:00:00Z", AGORA)).toBe(true);
    expect(dentroDaJanela24h("2026-10-27T15:00:01Z", AGORA)).toBe(true);
    expect(dentroDaJanela24h("2026-10-27T15:00:00Z", AGORA)).toBe(false);
    expect(dentroDaJanela24h("2026-10-20T15:00:00Z", AGORA)).toBe(false);
  });

  it("trata instante futuro como recém-chegado e data inválida como fora", () => {
    expect(dentroDaJanela24h("2026-10-28T15:05:00Z", AGORA)).toBe(true);
    expect(dentroDaJanela24h("não é data", AGORA)).toBe(false);
  });

  it("restanteNaJanelaMs informa quanto falta", () => {
    expect(restanteNaJanelaMs("2026-10-28T14:00:00Z", AGORA)).toBe(JANELA_24H_MS - 60 * 60 * 1000);
    expect(restanteNaJanelaMs("2026-10-26T14:00:00Z", AGORA)).toBe(0);
    expect(restanteNaJanelaMs(null, AGORA)).toBeNull();
  });
});
