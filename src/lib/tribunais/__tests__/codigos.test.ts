import { describe, expect, it } from "vitest";
import { identificarTribunal, TRIBUNAIS_ESTADUAIS } from "../codigos";

// NNNNNNN-DD.AAAA.J.TR.OOOO: 1234567-89.2025.8.26.0100 é TJSP (J=8, TR=26)
describe("identificação do tribunal pelo número CNJ", () => {
  it("identifica o TJ estadual pelo TR", () => {
    expect(identificarTribunal("1234567-89.2025.8.26.0100")).toMatchObject({ aplicavel: true, sigla: "TJSP", nome: "São Paulo", mato_grosso: false, motivo: null });
  });

  it("TR 11 é o TJ-MT: fora desta análise", () => {
    expect(identificarTribunal("1234567-89.2025.8.11.0041")).toMatchObject({ aplicavel: false, mato_grosso: true, sigla: "TJMT" });
  });

  it("segmento diferente de 8 não é Justiça estadual", () => {
    expect(identificarTribunal("1234567-89.2025.4.01.0001")).toMatchObject({ aplicavel: false, mato_grosso: false, sigla: null });
    expect(identificarTribunal("1234567-89.2025.4.01.0001").motivo).toMatch(/segmento J=4/);
  });

  it("número sem 20 dígitos não é identificável", () => {
    expect(identificarTribunal("1234567-89.2025")).toMatchObject({ aplicavel: false, motivo: "número CNJ com 20 dígitos não encontrado" });
  });

  it("TR fora de 01 a 27 não corresponde a TJ estadual", () => {
    expect(identificarTribunal("1234567-89.2025.8.99.0001").motivo).toMatch(/TR 99/);
    expect(identificarTribunal("1234567-89.2025.8.00.0001").aplicavel).toBe(false);
  });

  it("a tabela cobre os 27 estados e o DF, na ordem da skill", () => {
    expect(Object.keys(TRIBUNAIS_ESTADUAIS)).toHaveLength(27);
    expect(TRIBUNAIS_ESTADUAIS["07"].sigla).toBe("TJDFT");
    expect(TRIBUNAIS_ESTADUAIS["19"].sigla).toBe("TJRJ");
    expect(TRIBUNAIS_ESTADUAIS["27"].sigla).toBe("TJTO");
  });
});
