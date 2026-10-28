import { describe, expect, it } from "vitest";
import { calcularDv, decomporCnj, extrairDigitosCnj, extrairTodosCnj, formatarCnj, montarCnj, tentarDecomporCnj, validarDigitosCnj } from "../numero-cnj";

describe("número CNJ", () => {
  it("monta um número válido e o reconhece", () => {
    const d = montarCnj(1002345, 2025, 8, "11", "0041");
    expect(d).toHaveLength(20);
    expect(validarDigitosCnj(d)).toBe(true);
    const n = decomporCnj(d);
    expect(n.ano).toBe(2025);
    expect(n.segmento).toBe(8);
    expect(n.tribunal).toBe("11");
    expect(n.origem).toBe("0041");
    expect(n.tribunalSigla).toBe("TJMT");
    expect(n.segmentoNome).toBe("Justiça Estadual");
    expect(n.mascara).toMatch(/^\d{7}-\d{2}\.2025\.8\.11\.0041$/);
  });

  it("o dígito verificador segue o módulo 97 (ISO 7064)", () => {
    // Para a base NNNNNNNAAAAJTROOOO00, DV = 98 - (base mod 97)
    const dv = calcularDv("0000001", "2020", "8", "11", "0001");
    const base = BigInt("0000001" + "2020" + "8" + "11" + "0001" + "00");
    const esperado = 98n - (base % 97n);
    expect(dv).toBe(String(esperado).padStart(2, "0"));
  });

  it("rejeita dígito verificador errado", () => {
    const d = montarCnj(123, 2024, 8, "11", "0002");
    const errado = d.slice(0, 7) + (d.slice(7, 9) === "11" ? "12" : "11") + d.slice(9);
    expect(validarDigitosCnj(errado)).toBe(false);
    expect(() => decomporCnj(errado)).toThrow(/dígito verificador inválido/);
    expect(tentarDecomporCnj(errado)).toBeNull();
  });

  it("extrai de texto com máscara e sem máscara", () => {
    const d = montarCnj(555, 2023, 8, "11", "0041");
    const mascara = formatarCnj(d);
    expect(extrairDigitosCnj(`Processo nº ${mascara} - intimação`)).toBe(d);
    expect(extrairDigitosCnj(d)).toBe(d);
    expect(extrairDigitosCnj("sem número")).toBeNull();
    expect(extrairDigitosCnj("")).toBeNull();
  });

  it("extrai todos os números válidos de um texto, sem repetir e ignorando inválidos", () => {
    const a = formatarCnj(montarCnj(1, 2022, 8, "11", "0001"));
    const b = formatarCnj(montarCnj(2, 2022, 8, "11", "0001"));
    const invalido = a.slice(0, 8) + (a[8] === "0" ? "1" : "0") + a.slice(9);
    const texto = `Autos ${a} e ${b}; também ${a}. Inválido: ${invalido}`;
    expect(extrairTodosCnj(texto).sort()).toEqual([montarCnj(1, 2022, 8, "11", "0001"), montarCnj(2, 2022, 8, "11", "0001")].sort());
  });

  it("identifica outros segmentos e tribunais", () => {
    const trf = decomporCnj(montarCnj(10, 2021, 4, "01", "3600"));
    expect(trf.segmentoNome).toBe("Justiça Federal");
    expect(trf.tribunalSigla).toBeNull();
    const sp = decomporCnj(montarCnj(10, 2021, 8, "26", "0100"));
    expect(sp.tribunalSigla).toBe("TJSP");
  });

  it("formatarCnj exige 20 dígitos", () => {
    expect(() => formatarCnj("123")).toThrow();
  });
});
