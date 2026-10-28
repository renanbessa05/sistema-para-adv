import { describe, expect, it } from "vitest";
import { formatarCnj, montarCnj } from "@/lib/cnj";
import { detectarSeparador, dividirLinhaCsv, parseCarteiraCsv } from "./importar-carteira";

const cnj1 = montarCnj(1, 2025, 8, "11", "0041");
const cnj2 = montarCnj(2, 2024, 8, "11", "0002");
const cnj3 = montarCnj(3, 2023, 8, "26", "0100");
const cabecalho = "numero_cnj;cliente;cpf_cnpj;polo;parte_contraria;comarca;responsavel;colaboradores;sigiloso;observacoes";

describe("dividirLinhaCsv", () => {
  it("respeita aspas e aspas escapadas", () => {
    expect(dividirLinhaCsv('a;"b;c";"d ""e"" f";g', ";")).toEqual(["a", "b;c", 'd "e" f', "g"]);
    expect(dividirLinhaCsv("1,2,,4", ",")).toEqual(["1", "2", "", "4"]);
  });
});

describe("detectarSeparador", () => {
  it("escolhe o separador mais frequente fora de aspas", () => {
    expect(detectarSeparador("a;b;c")).toBe(";");
    expect(detectarSeparador("a,b,c")).toBe(",");
    expect(detectarSeparador('"a,b,c";d')).toBe(";");
  });
});

describe("parseCarteiraCsv", () => {
  it("lê linhas válidas com ponto e vírgula, polo por sinônimo e sigiloso s/n", () => {
    const csv = [cabecalho, `${formatarCnj(cnj1)};Maria da Silva;123.456.789-01;autora;Banco X S.A.;Cuiabá;ana@escritorio.adv.br;João|Pedro;s;Cobrança`, `${cnj2};Empresa Y Ltda;12.345.678/0001-90;passivo;;Rondonópolis;;;n;`].join("\n");
    const r = parseCarteiraCsv(csv);
    expect(r.separador).toBe(";");
    expect(r.rejeitadas).toEqual([]);
    expect(r.validas).toHaveLength(2);
    const [a, b] = r.validas;
    expect(a).toMatchObject({ linha: 2, numero_cnj: cnj1, numero_cnj_mascara: formatarCnj(cnj1), tribunal_sigla: "TJMT", cliente: "Maria da Silva", cpf_cnpj: "12345678901", polo: "ativo", parte_contraria: "Banco X S.A.", comarca: "Cuiabá", responsavel: "ana@escritorio.adv.br", colaboradores: ["João", "Pedro"], sigiloso: true, observacoes: "Cobrança" });
    expect(b).toMatchObject({ linha: 3, numero_cnj: cnj2, cpf_cnpj: "12345678000190", polo: "passivo", parte_contraria: null, responsavel: null, colaboradores: [], sigiloso: false, observacoes: null });
  });

  it("aceita vírgula como separador, campos entre aspas, cabeçalho com acento/maiúsculas e BOM", () => {
    const csv = ["﻿Numero CNJ,Cliente,Polo,Parte Contrária", `"${formatarCnj(cnj3)}","Souza, José",ativo,"Estado de SP"`].join("\r\n");
    const r = parseCarteiraCsv(csv);
    expect(r.separador).toBe(",");
    expect(r.rejeitadas).toEqual([]);
    expect(r.validas[0]).toMatchObject({ cliente: "Souza, José", parte_contraria: "Estado de SP", tribunal_sigla: "TJSP", polo: "ativo" });
  });

  it("polo vazio vira ativo (o cliente costuma ser o autor)", () => {
    const r = parseCarteiraCsv(["numero_cnj;cliente", `${cnj1};Fulano`].join("\n"));
    expect(r.validas[0].polo).toBe("ativo");
    expect(r.validas[0].sigiloso).toBe(false);
  });

  it("rejeita com motivo: CNJ inválido, ausente, repetido, cliente ausente, documento, polo e sigiloso inválidos", () => {
    const invalido = cnj1.slice(0, 7) + "99" + cnj1.slice(9);
    const csv = [
      cabecalho,
      `${invalido};Cliente A;;;;;;;;`,
      `;Cliente B;;;;;;;;`,
      `${cnj1};Cliente C;;;;;;;;`,
      `${cnj1};Cliente C de novo;;;;;;;;`,
      `${cnj2};;;;;;;;;`,
      `${cnj2};Cliente D;1234;;;;;;;`,
      `${cnj2};Cliente E;;autorzinho;;;;;;`,
      `${cnj2};Cliente F;;ativo;;;;;talvez;`,
      `${cnj3};Cliente G;;reu;;;;;sim;`,
    ].join("\n");
    const r = parseCarteiraCsv(csv);
    expect(r.validas.map((v) => v.cliente)).toEqual(["Cliente C", "Cliente G"]);
    expect(r.validas[1]).toMatchObject({ polo: "passivo", sigiloso: true });
    expect(r.rejeitadas).toEqual([
      { linha: 2, numero_cnj: invalido, motivo: expect.stringContaining("dígito verificador") },
      { linha: 3, numero_cnj: null, motivo: "Número CNJ ausente" },
      { linha: 5, numero_cnj: formatarCnj(cnj1), motivo: "Número CNJ repetido no arquivo" },
      { linha: 6, numero_cnj: formatarCnj(cnj2), motivo: "Cliente ausente" },
      { linha: 7, numero_cnj: formatarCnj(cnj2), motivo: expect.stringContaining("CPF/CNPJ com 4 dígitos") },
      { linha: 8, numero_cnj: formatarCnj(cnj2), motivo: expect.stringContaining("Polo desconhecido") },
      { linha: 9, numero_cnj: formatarCnj(cnj2), motivo: expect.stringContaining("Sigiloso deve ser s ou n") },
    ]);
  });

  it("rejeita o arquivo inteiro sem as colunas obrigatórias ou vazio", () => {
    expect(parseCarteiraCsv("").rejeitadas[0].motivo).toBe("Arquivo vazio");
    const r = parseCarteiraCsv("processo;nome\n123;abc");
    expect(r.validas).toEqual([]);
    expect(r.rejeitadas[0].motivo).toContain("numero_cnj e cliente");
  });

  it("ignora linhas em branco no meio e no fim", () => {
    const r = parseCarteiraCsv(["numero_cnj;cliente", "", `${cnj1};A`, "   ", `${cnj2};B`, ""].join("\n"));
    expect(r.validas.map((v) => v.cliente)).toEqual(["A", "B"]);
  });
});
