import { describe, expect, it } from "vitest";
import { deveAlertarTeto, inicioDoMesUtc, mesDeReferencia, percentualAlerta, taxaCacheHit } from "../monitoramento";

describe("monitoramento de IA", () => {
  it("percentual de alerta: padrão 80 e valores inválidos caem no padrão", () => {
    expect(percentualAlerta(undefined)).toBe(80);
    expect(percentualAlerta(90)).toBe(90);
    expect(percentualAlerta("75")).toBe(75);
    expect(percentualAlerta("")).toBe(80);
    expect(percentualAlerta(0)).toBe(80);
    expect(percentualAlerta(101)).toBe(80);
    expect(percentualAlerta("abc")).toBe(80);
  });

  it("alerta a partir do percentual; teto zero nunca alerta", () => {
    expect(deveAlertarTeto(79.99, 100, 80)).toBe(false);
    expect(deveAlertarTeto(80, 100, 80)).toBe(true);
    expect(deveAlertarTeto(120, 100, 80)).toBe(true);
    expect(deveAlertarTeto(500, 0, 80)).toBe(false);
  });

  it("mês e início do mês em UTC", () => {
    const agora = new Date("2026-10-31T23:30:00Z");
    expect(mesDeReferencia(agora)).toBe("2026-10");
    expect(inicioDoMesUtc(agora)).toBe("2026-10-01T00:00:00.000Z");
  });

  it("taxa de cache: leitura sobre o total de entrada; null sem tokens", () => {
    expect(taxaCacheHit(100, 100, 800)).toBe(0.8);
    expect(taxaCacheHit(0, 0, 0)).toBeNull();
  });
});
