import { describe, expect, it } from "vitest";
import { ErroImportacao, normalizarData, parsearImportacao } from "../importar";

const CABECALHO = "tribunal;tipo;referencia;orgao;data;ementa";

describe("importação de jurisprudência", () => {
  it("lê CSV e mantém ponto e vírgula dentro da ementa", () => {
    const csv = `${CABECALHO}\nSTJ;sumula;Súmula 7/STJ;Segunda Seção;;A pretensão de simples reexame de prova; não enseja recurso especial.`;
    const [r] = parsearImportacao("csv", csv);
    expect(r).toEqual({
      tribunal: "STJ",
      tipo: "sumula",
      referencia: "Súmula 7/STJ",
      orgao: "Segunda Seção",
      data: null,
      ementa: "A pretensão de simples reexame de prova; não enseja recurso especial.",
    });
  });

  it("aceita data em DD/MM/AAAA e AAAA-MM-DD, e órgão vazio vira null", () => {
    const csv = `${CABECALHO}\nSTJ;acordao;REsp 1/MT;;15/03/2024;ementa com texto suficiente aqui\nSTJ;acordao;REsp 2/MT;;2024-04-01;outra ementa com texto suficiente`;
    const [a, b] = parsearImportacao("csv", csv);
    expect(a.data).toBe("2024-03-15");
    expect(a.orgao).toBeNull();
    expect(b.data).toBe("2024-04-01");
  });

  it("aceita JSON com lista de registros, com órgão e data opcionais", () => {
    const json = JSON.stringify([{ tribunal: "TJMT", tipo: "acordao", referencia: "Apelação Cível 1234", ementa: "ementa longa o bastante para passar na regra" }]);
    const [r] = parsearImportacao("json", json);
    expect(r).toMatchObject({ tribunal: "TJMT", data: null, orgao: null });
  });

  it("recusa CSV sem linhas de dados e linha com colunas faltando", () => {
    expect(() => parsearImportacao("csv", CABECALHO)).toThrow(/sem linhas de dados/);
    expect(() => parsearImportacao("csv", `${CABECALHO}\nSTJ;sumula;Súmula 7`)).toThrow(/faltam colunas/);
  });

  it("recusa JSON que não é lista e JSON inválido", () => {
    expect(() => parsearImportacao("json", "{}")).toThrow(ErroImportacao);
    expect(() => parsearImportacao("json", "{não é json")).toThrow(/JSON inválido/);
  });

  it("recusa registro com tipo desconhecido, ementa curta ou data inválida", () => {
    expect(() => parsearImportacao("json", JSON.stringify([{ tribunal: "STJ", tipo: "lei", referencia: "Lei 1", ementa: "ementa suficientemente longa aqui" }]))).toThrow(/Registro 1/);
    expect(() => parsearImportacao("json", JSON.stringify([{ tribunal: "STJ", tipo: "sumula", referencia: "Súmula 7", ementa: "curta" }]))).toThrow(/menos de 20/);
    expect(() => normalizarData("2024/03/15")).toThrow(/Data inválida/);
  });

  it("normalizarData: vazio vira null", () => {
    expect(normalizarData(undefined)).toBeNull();
    expect(normalizarData("2024-05-17")).toBe("2024-05-17");
  });
});
