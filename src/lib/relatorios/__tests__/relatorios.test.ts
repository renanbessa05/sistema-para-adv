import { describe, expect, it } from "vitest";
import {
  competenciaValida,
  linhaDeRpc,
  mesAnterior,
  primeiroDiaDoMes,
  resumirPorUsuario,
  rotuloMes,
  taxaCumprimento,
  tempoMedioRevisao,
  totaisDoPeriodo,
  type LinhaProdutividade,
} from "../agregar";
import { celulaCsv, csvProdutividade, gerarCsv } from "../csv";

function linha(extra: Partial<LinhaProdutividade> = {}): LinhaProdutividade {
  return {
    usuarioId: "u1",
    nome: "Ana",
    competencia: "2026-09-01",
    tarefasConcluidas: 0,
    prazosConfirmados: 0,
    prazosCumpridos: 0,
    prazosVencidos: 0,
    publicacoesTratadas: 0,
    aprovacoesDecididas: 0,
    tempoRevisaoTotalS: 0,
    ...extra,
  };
}

describe("linhaDeRpc", () => {
  it("converte snake_case e números em texto", () => {
    const l = linhaDeRpc({
      usuario_id: "u1",
      nome_completo: "Ana",
      competencia: "2026-09-01",
      tarefas_concluidas: "3",
      prazos_confirmados: 2,
      prazos_cumpridos: null,
      prazos_vencidos: undefined,
      publicacoes_tratadas: 1,
      aprovacoes_decididas: 4,
      tempo_revisao_total_s: "120.5",
    });
    expect(l).toEqual({
      usuarioId: "u1",
      nome: "Ana",
      competencia: "2026-09-01",
      tarefasConcluidas: 3,
      prazosConfirmados: 2,
      prazosCumpridos: 0,
      prazosVencidos: 0,
      publicacoesTratadas: 1,
      aprovacoesDecididas: 4,
      tempoRevisaoTotalS: 120.5,
    });
  });

  it("usa rótulo quando não há nome e zera número inválido", () => {
    const l = linhaDeRpc({ usuario_id: "u2", competencia: "2026-09-01", nome_completo: null, tarefas_concluidas: "abc" });
    expect(l.nome).toBe("(sem nome)");
    expect(l.tarefasConcluidas).toBe(0);
  });
});

describe("taxaCumprimento e tempoMedioRevisao", () => {
  it("calcula a taxa e devolve null sem prazos", () => {
    expect(taxaCumprimento(3, 1)).toBe(0.75);
    expect(taxaCumprimento(1, 2)).toBe(0.3333);
    expect(taxaCumprimento(0, 0)).toBeNull();
  });

  it("calcula a média de revisão e devolve null sem decisões", () => {
    expect(tempoMedioRevisao(100, 3)).toBe(33.3);
    expect(tempoMedioRevisao(0, 0)).toBeNull();
  });
});

describe("resumirPorUsuario", () => {
  it("soma os meses de cada pessoa, calcula médias e ordena por nome", () => {
    const resumo = resumirPorUsuario([
      linha({ usuarioId: "u2", nome: "Beto", tarefasConcluidas: 1 }),
      linha({ usuarioId: "u1", nome: "Ana", tarefasConcluidas: 2, prazosCumpridos: 3, prazosVencidos: 1, aprovacoesDecididas: 2, tempoRevisaoTotalS: 60 }),
      linha({ usuarioId: "u1", nome: "Ana", competencia: "2026-10-01", tarefasConcluidas: 1, prazosCumpridos: 1, aprovacoesDecididas: 2, tempoRevisaoTotalS: 40, publicacoesTratadas: 5, prazosConfirmados: 2 }),
    ]);
    expect(resumo.map((r) => r.nome)).toEqual(["Ana", "Beto"]);
    expect(resumo[0]).toMatchObject({
      usuarioId: "u1",
      tarefasConcluidas: 3,
      prazosConfirmados: 2,
      prazosCumpridos: 4,
      prazosVencidos: 1,
      publicacoesTratadas: 5,
      aprovacoesDecididas: 4,
      tempoRevisaoMedioS: 25,
      taxaCumprimento: 0.8,
    });
    expect(resumo[1]).toMatchObject({ usuarioId: "u2", tempoRevisaoMedioS: null, taxaCumprimento: null });
  });

  it("lista vazia devolve lista vazia", () => {
    expect(resumirPorUsuario([])).toEqual([]);
  });
});

describe("totaisDoPeriodo", () => {
  it("soma todas as pessoas", () => {
    const resumo = resumirPorUsuario([
      linha({ usuarioId: "u1", nome: "Ana", tarefasConcluidas: 2, prazosCumpridos: 3, prazosVencidos: 1, publicacoesTratadas: 1, prazosConfirmados: 1, aprovacoesDecididas: 1 }),
      linha({ usuarioId: "u2", nome: "Beto", tarefasConcluidas: 1, prazosCumpridos: 1, prazosVencidos: 0 }),
    ]);
    expect(totaisDoPeriodo(resumo)).toEqual({
      tarefasConcluidas: 3,
      prazosConfirmados: 1,
      prazosCumpridos: 4,
      prazosVencidos: 1,
      publicacoesTratadas: 1,
      aprovacoesDecididas: 1,
      taxaCumprimento: 0.8,
    });
  });

  it("sem prazos, taxa é null", () => {
    expect(totaisDoPeriodo([]).taxaCumprimento).toBeNull();
  });
});

describe("competências", () => {
  it("valida AAAA-MM", () => {
    expect(competenciaValida("2026-10")).toBe(true);
    expect(competenciaValida("2026-13")).toBe(false);
    expect(competenciaValida("2026-00")).toBe(false);
    expect(competenciaValida("10/2026")).toBe(false);
  });

  it("primeiro dia do mês e mês anterior, inclusive a virada de ano", () => {
    expect(primeiroDiaDoMes("2026-10-29")).toBe("2026-10-01");
    expect(mesAnterior("2026-10-29")).toBe("2026-09-01");
    expect(mesAnterior("2026-01-05")).toBe("2025-12-01");
  });

  it("rotula o mês em pt-BR", () => {
    expect(rotuloMes("2026-10-01")).toBe("outubro de 2026");
  });
});

describe("csv", () => {
  it("escapa aspas, protege contra fórmula e formata números", () => {
    expect(celulaCsv(null)).toBe("");
    expect(celulaCsv(undefined)).toBe("");
    expect(celulaCsv('Ana "A"')).toBe('"Ana ""A"""');
    expect(celulaCsv("=HYPERLINK()")).toBe("\"'=HYPERLINK()\"");
    expect(celulaCsv(3)).toBe("3");
    expect(celulaCsv(2.5)).toBe("2,5");
    expect(celulaCsv(Number.NaN)).toBe("");
  });

  it("gera BOM, separador ; e quebra CRLF", () => {
    const csv = gerarCsv(["a", "b"], [["x", 1]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿"a";"b"\r\n"x";1\r\n');
  });

  it("gera o CSV de produtividade com taxa em percentual", () => {
    const resumo = resumirPorUsuario([linha({ nome: "Ana", prazosCumpridos: 2, prazosVencidos: 1, aprovacoesDecididas: 1, tempoRevisaoTotalS: 10 }), linha({ usuarioId: "u2", nome: "Beto" })]);
    const csv = csvProdutividade(resumo);
    const linhas = csv.replace("﻿", "").split("\r\n");
    expect(linhas[0]).toContain("taxa_cumprimento_percentual");
    expect(linhas[1]).toBe('"Ana";0;0;2;1;66,7;0;1;10');
    expect(linhas[2]).toBe('"Beto";0;0;0;0;;0;0;');
  });
});
