import { describe, expect, it } from "vitest";
import {
  adicionarDias,
  diaSemanaDe,
  ehDiaUtil,
  horasUteisEntre,
  instanteLocal,
  partesLocais,
  proximoDiaUtil,
  proximoInstanteUtil,
} from "../horas-uteis";

const TZ = "America/Cuiaba"; // UTC-4, sem horário de verão
const SEM_FERIADOS = { feriados: [] as string[] };

describe("partesLocais", () => {
  it("converte 2026-10-30T23:30Z para 19:30 de sexta em Cuiabá", () => {
    expect(partesLocais(new Date("2026-10-30T23:30:00Z"), TZ)).toEqual({ data: "2026-10-30", hora: 19, minuto: 30, diaSemana: 5 });
  });

  it("muda o dia local quando a UTC já virou", () => {
    expect(partesLocais(new Date("2026-10-31T02:15:00Z"), TZ)).toEqual({ data: "2026-10-30", hora: 22, minuto: 15, diaSemana: 5 });
    expect(partesLocais(new Date("2026-10-31T04:00:00Z"), TZ)).toEqual({ data: "2026-10-31", hora: 0, minuto: 0, diaSemana: 6 });
  });

  it("usa Cuiabá por padrão e aceita outro fuso", () => {
    expect(partesLocais(new Date("2026-10-30T23:30:00Z")).hora).toBe(19);
    expect(partesLocais(new Date("2026-10-30T23:30:00Z"), "America/Sao_Paulo").hora).toBe(20);
  });
});

describe("ehDiaUtil e auxiliares de data", () => {
  it("sábado, domingo e feriado não são úteis", () => {
    expect(ehDiaUtil("2026-10-30", SEM_FERIADOS)).toBe(true); // sexta
    expect(ehDiaUtil("2026-10-31", SEM_FERIADOS)).toBe(false); // sábado
    expect(ehDiaUtil("2026-11-01", SEM_FERIADOS)).toBe(false); // domingo
    expect(ehDiaUtil("2026-11-02", SEM_FERIADOS)).toBe(true); // segunda
    expect(ehDiaUtil("2026-11-02", { feriados: ["2026-11-02"] })).toBe(false); // Finados informado pelo chamador
  });

  it("diaSemanaDe, adicionarDias e proximoDiaUtil", () => {
    expect(diaSemanaDe("2026-10-28")).toBe(3);
    expect(adicionarDias("2026-10-30", 2)).toBe("2026-11-01");
    expect(adicionarDias("2026-01-01", -1)).toBe("2025-12-31");
    expect(proximoDiaUtil("2026-10-30", SEM_FERIADOS)).toBe("2026-11-02");
    expect(proximoDiaUtil("2026-10-30", { feriados: ["2026-11-02"] })).toBe("2026-11-03");
    expect(() => diaSemanaDe("30/10/2026")).toThrow(/YYYY-MM-DD/);
  });
});

describe("instanteLocal", () => {
  it("07:30 em Cuiabá é 11:30Z", () => {
    expect(instanteLocal("2026-10-29", 7, 30, TZ).toISOString()).toBe("2026-10-29T11:30:00.000Z");
  });

  it("é inverso de partesLocais", () => {
    const d = instanteLocal("2026-10-30", 19, 30, TZ);
    expect(partesLocais(d, TZ)).toMatchObject({ data: "2026-10-30", hora: 19, minuto: 30 });
  });
});

describe("horasUteisEntre", () => {
  // Horário local → UTC: somar 4 h.
  const local = (data: string, h: number, m = 0) => instanteLocal(data, h, m, TZ);

  it("sexta 17h até segunda 9h = 2 horas úteis", () => {
    expect(horasUteisEntre(local("2026-10-30", 17), local("2026-11-02", 9), { tz: TZ, ...SEM_FERIADOS })).toBe(2);
  });

  it("mesmo dia dentro do expediente conta minutos", () => {
    expect(horasUteisEntre(local("2026-10-28", 9), local("2026-10-28", 10, 30), { tz: TZ, ...SEM_FERIADOS })).toBe(1.5);
  });

  it("ignora o que cai fora do expediente e em feriado", () => {
    // quarta 6h → quarta 20h: só 8h-18h conta
    expect(horasUteisEntre(local("2026-10-28", 6), local("2026-10-28", 20), { tz: TZ, ...SEM_FERIADOS })).toBe(10);
    // sexta 17h → terça 9h com segunda feriado = 1 (sexta) + 1 (terça)
    expect(horasUteisEntre(local("2026-10-30", 17), local("2026-11-03", 9), { tz: TZ, feriados: ["2026-11-02"] })).toBe(2);
    // dentro do fim de semana: zero
    expect(horasUteisEntre(local("2026-10-31", 9), local("2026-11-01", 17), { tz: TZ, ...SEM_FERIADOS })).toBe(0);
  });

  it("aceita expediente customizado e devolve 0 para intervalo invertido", () => {
    expect(horasUteisEntre(local("2026-10-28", 7), local("2026-10-28", 23), { tz: TZ, feriados: [], expedienteInicio: 9, expedienteFim: 12 })).toBe(3);
    expect(horasUteisEntre(local("2026-10-28", 10), local("2026-10-28", 9), { tz: TZ, ...SEM_FERIADOS })).toBe(0);
  });

  it("dias inteiros no meio contam 10 horas cada", () => {
    // quarta 8h → sexta 18h = 30h
    expect(horasUteisEntre(local("2026-10-28", 8), local("2026-10-30", 18), { tz: TZ, ...SEM_FERIADOS })).toBe(30);
  });
});

describe("proximoInstanteUtil", () => {
  const opts = { tz: TZ, ...SEM_FERIADOS };

  it("devolve o próprio instante dentro do expediente de dia útil", () => {
    const d = new Date("2026-10-28T14:00:00Z"); // quarta 10h local
    expect(proximoInstanteUtil(d, opts)).toBe(d);
  });

  it("antes da abertura em dia útil → hoje às 8h", () => {
    expect(proximoInstanteUtil(new Date("2026-10-28T09:00:00Z"), opts).toISOString()).toBe("2026-10-28T12:00:00.000Z");
  });

  it("depois do fechamento na sexta → segunda às 8h; feriado pula", () => {
    expect(proximoInstanteUtil(new Date("2026-10-30T23:30:00Z"), opts).toISOString()).toBe("2026-11-02T12:00:00.000Z");
    expect(proximoInstanteUtil(new Date("2026-10-30T23:30:00Z"), { tz: TZ, feriados: ["2026-11-02"] }).toISOString()).toBe(
      "2026-11-03T12:00:00.000Z",
    );
  });

  it("no sábado → segunda às 8h, mesmo cedo", () => {
    expect(proximoInstanteUtil(new Date("2026-10-31T09:00:00Z"), opts).toISOString()).toBe("2026-11-02T12:00:00.000Z");
  });
});
