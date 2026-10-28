import { describe, expect, it } from "vitest";
import { calcularPeriodos } from "../periodos";
import { calendarioCuiaba } from "./fixture-calendario";

describe("períodos do glossário", () => {
  const cal = calendarioCuiaba();

  it("numa quarta: amanhã é quinta e a semana vai até a próxima segunda", () => {
    const p = calcularPeriodos(cal, { timeZone: "America/Cuiaba", hoje: "2026-03-11" });
    expect(p.amanha).toBe("2026-03-12");
    expect(p.semanaFim).toBe("2026-03-16");
  });

  it("na sexta: amanhã é segunda; véspera de feriado pula o feriado", () => {
    expect(calcularPeriodos(cal, { timeZone: "America/Cuiaba", hoje: "2026-03-13" }).amanha).toBe("2026-03-16");
    expect(calcularPeriodos(cal, { timeZone: "America/Cuiaba", hoje: "2026-04-02" }).amanha).toBe("2026-04-06");
  });

  it("no fim de semana a semana é a que vem; sem próxima segunda termina na sexta", () => {
    const sabado = calcularPeriodos(cal, { timeZone: "America/Cuiaba", hoje: "2026-03-14", incluirProximaSegunda: false });
    expect(sabado.semanaFim).toBe("2026-03-20");
    const domingo = calcularPeriodos(cal, { timeZone: "America/Cuiaba", hoje: "2026-03-15", incluirProximaSegunda: false });
    expect(domingo.semanaFim).toBe("2026-03-20");
  });

  it("usa o relógio e o fuso quando 'hoje' não é informado", () => {
    const p = calcularPeriodos(cal, { timeZone: "America/Cuiaba", agora: new Date("2026-03-12T02:00:00Z") });
    expect(p.hoje).toBe("2026-03-11");
  });
});
