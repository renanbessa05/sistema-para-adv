import { describe, expect, it } from "vitest";
import { arredondar, atualizarDivida, atualizarItem, diasEntre, ErroCalculo, fatorCorrecao, mesDe, mesesDeCompetencia, somaSelic, type RegraCalculo, type Serie } from "../atualizar";

const INPC: Serie = { "2024-01": 1, "2024-02": 2, "2024-03": -1, "2024-04": 0.5 };
const SELIC: Serie = { "2024-01": 1, "2024-02": 1, "2024-03": 1, "2024-04": 1 };
const IPCA: Serie = { "2024-01": 0.5, "2024-02": 0.5, "2024-03": 0.5, "2024-04": 0.5 };

const base: RegraCalculo = { codigo: "x", correcao: null, jurosTaxaMensal: null, jurosSelic: false, jurosSelicMenosIpca: false };

describe("meses e dias", () => {
  it("lista as competências entre duas datas, atravessando o ano", () => {
    expect(mesesDeCompetencia("2024-11", "2025-02")).toEqual(["2024-12", "2025-01", "2025-02"]);
    expect(mesesDeCompetencia("2024-03", "2024-03")).toEqual([]);
    expect(mesDe("2024-05-17")).toBe("2024-05");
  });

  it("conta dias e recusa data final anterior à inicial", () => {
    expect(diasEntre("2024-01-01", "2024-01-31")).toBe(30);
    expect(diasEntre("2024-02-28", "2024-03-01")).toBe(2);
    expect(() => diasEntre("2024-05-02", "2024-05-01")).toThrow(ErroCalculo);
  });
});

describe("correção e somas", () => {
  it("encadeia as variações mensais do mês seguinte ao inicial até o final", () => {
    const { fator, meses } = fatorCorrecao(INPC, "2024-01-15", "2024-04-30");
    expect(meses).toEqual(["2024-02", "2024-03", "2024-04"]);
    expect(fator).toBeCloseTo(1.02 * 0.99 * 1.005, 10);
  });

  it("falha quando falta índice no período, em vez de chutar", () => {
    expect(() => fatorCorrecao({ "2024-02": 1 }, "2024-01-01", "2024-03-31")).toThrow(/2024-03/);
    expect(() => somaSelic({ "2024-02": Number.NaN }, "2024-01-01", "2024-02-28")).toThrow(ErroCalculo);
  });

  it("soma SELIC simples do período", () => {
    expect(somaSelic(SELIC, "2024-01-10", "2024-04-10")).toEqual({ taxa: 3, meses: ["2024-02", "2024-03", "2024-04"] });
  });
});

describe("atualizarItem", () => {
  it("sem regra de correção nem juros, devolve o valor original", () => {
    const r = atualizarItem({ descricao: "a", dataInicial: "2024-01-01", valorOriginal: 1000 }, base, {}, "2024-04-30");
    expect(r).toMatchObject({ valorCorrigido: 1000, juros: 0, total: 1000, passos: [] });
  });

  it("correção pelo INPC mais juros simples de 1% ao mês por dias", () => {
    const regra: RegraCalculo = { ...base, correcao: "inpc", jurosTaxaMensal: 1 };
    const r = atualizarItem({ descricao: "dano", dataInicial: "2024-01-01", valorOriginal: 10_000 }, regra, { inpc: INPC }, "2024-03-31");
    const corrigido = 10_000 * 1.02 * 0.99;
    expect(r.valorCorrigido).toBe(arredondar(corrigido));
    expect(r.juros).toBe(arredondar(corrigido * 0.01 * (90 / 30)));
    expect(r.total).toBe(arredondar(corrigido + corrigido * 0.01 * 3));
    expect(r.passos.map((p) => p.etapa)).toEqual(["correcao", "juros"]);
  });

  it("Fazenda (EC 113): só SELIC acumulada sobre o valor, sem correção em separado", () => {
    const regra: RegraCalculo = { ...base, jurosSelic: true };
    const r = atualizarItem({ descricao: "precatório", dataInicial: "2024-01-01", valorOriginal: 2000 }, regra, { selic: SELIC }, "2024-04-30");
    expect(r.valorCorrigido).toBe(2000);
    expect(r.juros).toBe(arredondar(2000 * 0.03));
    expect(r.passos[0].texto).toMatch(/SELIC acumulada de 3 mês/);
  });

  it("Lei 14.905: SELIC menos IPCA com piso zero", () => {
    const regra: RegraCalculo = { ...base, correcao: "ipca", jurosSelicMenosIpca: true };
    const r = atualizarItem({ descricao: "x", dataInicial: "2024-01-01", valorOriginal: 1000 }, regra, { ipca: IPCA, selic: SELIC }, "2024-04-30");
    expect(r.juros).toBeGreaterThan(0);
    const negativo = atualizarItem({ descricao: "x", dataInicial: "2024-01-01", valorOriginal: 1000 }, regra, { ipca: { ...IPCA, "2024-02": 5 }, selic: SELIC }, "2024-04-30");
    expect(negativo.passos.at(-1)?.texto).toMatch(/piso zero: 0\.0000%/);
  });

  it("falha sem a série necessária", () => {
    expect(() => atualizarItem({ descricao: "a", dataInicial: "2024-01-01", valorOriginal: 1 }, { ...base, correcao: "inpc" }, {}, "2024-02-28")).toThrow(/INPC não carregada/);
    expect(() => atualizarItem({ descricao: "a", dataInicial: "2024-01-01", valorOriginal: 1 }, { ...base, jurosSelic: true }, {}, "2024-02-28")).toThrow(/SELIC/);
    expect(() => atualizarItem({ descricao: "a", dataInicial: "2024-01-01", valorOriginal: 1 }, { ...base, jurosSelicMenosIpca: true }, { selic: SELIC }, "2024-02-28")).toThrow(/IPCA/);
  });

  it("taxa informada na correção não busca série: só o juro mensal", () => {
    const r = atualizarItem({ descricao: "a", dataInicial: "2024-01-01", valorOriginal: 500 }, { ...base, correcao: "informada", jurosTaxaMensal: 2 }, {}, "2024-01-31");
    expect(r.valorCorrigido).toBe(500);
    expect(r.juros).toBe(arredondar(500 * 0.02));
  });
});

describe("atualizarDivida", () => {
  it("soma os itens e devolve os totais", () => {
    const regra: RegraCalculo = { ...base, correcao: "inpc", jurosTaxaMensal: 1 };
    const r = atualizarDivida(
      [
        { descricao: "um", dataInicial: "2024-01-01", valorOriginal: 100 },
        { descricao: "dois", dataInicial: "2024-02-01", valorOriginal: 200 },
      ],
      regra,
      { inpc: INPC },
      "2024-04-30",
    );
    expect(r.itens).toHaveLength(2);
    expect(r.totais.valorOriginal).toBe(300);
    expect(r.totais.total).toBe(arredondar(r.itens[0].total + r.itens[1].total));
    expect(r.dataFinal).toBe("2024-04-30");
  });

  it("arredonda para centavos, meio para cima", () => {
    expect(arredondar(1.005)).toBe(1.01);
    expect(arredondar(2.5)).toBe(2.5);
  });
});

describe("correção sem meses no período", () => {
  it("datas no mesmo mês: fator 1 e passo sem intervalo", () => {
    const r = atualizarItem({ descricao: "a", dataInicial: "2024-02-03", valorOriginal: 700 }, { ...base, correcao: "inpc" }, { inpc: INPC }, "2024-02-20");
    expect(r.valorCorrigido).toBe(700);
    expect(r.passos[0].texto).toMatch(/0 mês\(es\) \(— a —\)/);
  });
});
