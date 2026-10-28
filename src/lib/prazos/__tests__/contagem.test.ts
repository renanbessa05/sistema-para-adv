import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { montarCalendario } from "../calendario";
import { calcularPrazo, memoriaComoTexto } from "../contagem";
import type { Calendario, EntradaCalculo, ResultadoCalculo } from "../tipos";
import { calendarioCuiaba, calendarioSemComarca, calendarioSo2026 } from "./fixture-calendario";

type Caso = {
  id: string;
  descricao: string;
  calendario: "cuiaba" | "semComarca" | "so2026";
  entrada: Omit<EntradaCalculo, "calendario">;
  esperado: Partial<ResultadoCalculo>;
};

const calendarios: Record<Caso["calendario"], () => Calendario> = {
  cuiaba: calendarioCuiaba,
  semComarca: calendarioSemComarca,
  so2026: calendarioSo2026,
};

const fixture = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../tests/fixtures/prazos-casos.json"), "utf8")) as { casos: Caso[] };

describe("motor de prazos: casos de referência", () => {
  for (const caso of fixture.casos) {
    it(`${caso.id}: ${caso.descricao}`, () => {
      const resultado = calcularPrazo({ ...caso.entrada, calendario: calendarios[caso.calendario]() });
      for (const [chave, valor] of Object.entries(caso.esperado)) {
        expect(resultado[chave as keyof ResultadoCalculo], chave).toEqual(valor);
      }
    });
  }
});

describe("motor de prazos: detalhes", () => {
  const cal = calendarioCuiaba();

  it("produz memória linha a linha com marcos, dias contados e pulados", () => {
    const r = calcularPrazo({ origem: "publicacao_djen", dataDisponibilizacao: "2026-03-06", ato: { descricao: "Contestação", quantidade: 15, contagem: "dias_uteis" }, calendario: cal });
    expect(r.memoria[0]).toMatchObject({ data: "2026-03-06", status: "marco" });
    expect(r.memoria[1]).toMatchObject({ data: "2026-03-09", status: "marco" });
    expect(r.memoria.find((l) => l.data === "2026-03-10")).toMatchObject({ dia: 1, status: "contado", motivo: "terça-feira" });
    expect(r.memoria.find((l) => l.data === "2026-03-14")).toMatchObject({ dia: null, status: "pulado", motivo: "sábado" });
    expect(r.memoria.find((l) => l.data === "2026-03-30")).toMatchObject({ dia: 15, status: "contado" });
    expect(r.memoria.at(-1)?.motivo).toMatch(/Data final: 30\/03\/2026/);
    expect(r.diasPulados).toHaveLength(6);
    expect(r.avisos.join(" ")).toMatch(/art\. 4º, §4º/);
    const texto = memoriaComoTexto(r);
    expect(texto).toContain("10/03/2026  dia  1  terça-feira");
    expect(texto).toContain("14/03/2026  —       pulado: sábado");
    expect(texto).toContain("• ");
  });

  it("registra o motivo de cada dia pulado no recesso", () => {
    const r = calcularPrazo({ origem: "publicacao_djen", dataDisponibilizacao: "2026-12-15", ato: { descricao: "Réplica", quantidade: 15, contagem: "dias_uteis" }, calendario: cal });
    const primeiroJaneiro = r.diasPulados.find((d) => d.data === "2027-01-01");
    expect(primeiroJaneiro?.motivo).toContain("Recesso");
    expect(primeiroJaneiro?.motivo).toContain("Confraternização");
    expect(r.diasPulados.find((d) => d.data === "2027-02-08")?.motivo).toBe("Carnaval");
    expect(r.diasPulados).toHaveLength(42);
  });

  it("dia de expediente reduzido conta, mas protrai o vencimento quando cai nele", () => {
    // 3 dias úteis a partir da publicação em 19/06/2026 (sexta): 22 (1), 23 (2), 24 (3, expediente reduzido) → protraído para 25/06
    const r = calcularPrazo({ origem: "manual", dataPublicacao: "2026-06-19", ato: { descricao: "Manifestação", quantidade: 3, contagem: "dias_uteis" }, calendario: cal });
    expect(r.memoria.find((l) => l.data === "2026-06-24")).toMatchObject({ dia: 3, status: "contado", motivo: "quarta-feira (Expediente reduzido (jogo da Copa))" });
    expect(r.dataFinal).toBe("2026-06-24");
  });

  it("protrai o vencimento de dias corridos que cai em suspensão não contada", () => {
    const r = calcularPrazo({ origem: "manual", dataPublicacao: "2026-03-05", ato: { descricao: "x", quantidade: 3, contagem: "dias_corridos" }, calendario: cal });
    expect(r.memoria.some((l) => l.status === "marco" && /protraído/.test(l.motivo))).toBe(true);
    expect(r.dataFinal).toBe("2026-03-09");
  });

  it("avisa sobre dobro, horas e prazo material", () => {
    const dobro = calcularPrazo({ origem: "manual", dataPublicacao: "2026-03-09", ato: { descricao: "x", quantidade: 1, contagem: "dias_uteis", multiplicador: 2, fundamentoDobro: "CPC art. 183" }, calendario: cal });
    expect(dobro.avisos.join(" ")).toMatch(/dobro aplicado \(CPC art\. 183\)/);
    const dobroSemFundamento = calcularPrazo({ origem: "manual", dataPublicacao: "2026-03-09", ato: { descricao: "x", quantidade: 1, contagem: "dias_uteis", multiplicador: 2 }, calendario: cal });
    expect(dobroSemFundamento.avisos.join(" ")).toMatch(/dobro aplicado;/);
    const horas = calcularPrazo({ origem: "manual", dataPublicacao: "2026-03-09", ato: { descricao: "x", quantidade: 24, contagem: "horas" }, calendario: cal });
    expect(horas.avisos.join(" ")).toMatch(/24 horas convertido em 1 dia/);
    const material = calcularPrazo({ origem: "manual", dataPublicacao: "2026-03-09", ato: { descricao: "x", quantidade: 1, contagem: "dias_corridos", tipo: "material" }, calendario: cal });
    expect(material.avisos.join(" ")).toMatch(/Prazo material/);
    expect(material.calendarioIncompleto).toBe(false);
  });

  it("prazo material sem comarca não marca calendário incompleto por comarca", () => {
    const r = calcularPrazo({ origem: "manual", dataPublicacao: "2026-03-09", ato: { descricao: "x", quantidade: 10, contagem: "dias_corridos", tipo: "material" }, calendario: calendarioSemComarca() });
    expect(r.calendarioIncompleto).toBe(false);
  });

  it("usa o dia 1 informado e rejeita quantidade inválida", () => {
    const r = calcularPrazo({ origem: "audiencia", dataInicioContagem: "2026-03-10", ato: { descricao: "x", quantidade: 2, contagem: "dias_uteis" }, calendario: cal });
    expect(r.dataInicioContagem).toBe("2026-03-10");
    expect(r.dataFinal).toBe("2026-03-11");
    expect(r.dataPublicacao).toBeNull();
    expect(() => calcularPrazo({ origem: "manual", dataPublicacao: "2026-03-09", ato: { descricao: "x", quantidade: 0, contagem: "dias_uteis" }, calendario: cal })).toThrow(/inteiro positivo/);
    expect(() => calcularPrazo({ origem: "manual", dataPublicacao: "2026-03-09", ato: { descricao: "x", quantidade: 1.5, contagem: "dias_uteis" }, calendario: cal })).toThrow(/inteiro positivo/);
  });

  it("protege contra laços sem fim", () => {
    const bloqueio = [];
    let d = new Date(Date.UTC(2026, 2, 10));
    for (let i = 0; i < 5100; i++) {
      bloqueio.push({ data: d.toISOString().slice(0, 10), descricao: "fechado", abrangencia: "suspensao_ad_hoc" as const, suspendePrazo: true });
      d = new Date(d.getTime() + 86_400_000);
    }
    const cal2 = montarCalendario(bloqueio, { tribunal: "X", anosCobertos: [2026], incluirRecesso: false });
    expect(() => calcularPrazo({ origem: "manual", dataInicioContagem: "2026-03-10", ato: { descricao: "x", quantidade: 1, contagem: "dias_corridos" }, calendario: cal2 })).toThrow(/5000 dias/);
  });
});
