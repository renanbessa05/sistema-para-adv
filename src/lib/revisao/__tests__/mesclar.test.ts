import { describe, expect, it } from "vitest";
import { mesclarRevisao, criticosAbertos } from "../mesclar";
import type { Revisao } from "../../ia/schemas/revisao";
import type { ResultadoValidacao } from "../../pecas/validar";

const modelo: Revisao = {
  veredito: "ajustes",
  mapa_argumentos: [],
  desconectados: [],
  sintese_md: "",
  dilui: [],
  checklist: [
    { id: "cnj", situacao: "ok", observacao: "modelo acha que está ok" },
    { id: "docs", situacao: "ok", observacao: null },
    { id: "competencia", situacao: "atencao", observacao: "rever vara" },
    { id: "pedidos_correlacao", situacao: "critico", observacao: "pedido sem causa" },
  ],
  pendencias: [],
  plano_acao: [],
};

const validacao: ResultadoValidacao = {
  itens: [
    { id: "cnj", rotulo: "CNJ", situacao: "falta", detalhe: "número diferente do processo" },
    { id: "docs", rotulo: "Docs", situacao: "falta", detalhe: "Doc. 07 inexistente" },
    { id: "lacunas", rotulo: "Lacunas", situacao: "ok", detalhe: null },
    { id: "tempestividade", rotulo: "Tempestividade", situacao: "nao_aplicavel", detalhe: null },
    { id: "oab", rotulo: "OAB", situacao: "atencao", detalhe: "sem número" },
  ],
  lacunas: 0,
  docs_citados: [7],
  docs_inexistentes: [7],
  citacoes_sem_id: [],
  cnj_encontrado: null,
  laudas_estimadas: 3,
  pronta: false,
};

describe("mesclarRevisao", () => {
  const final = mesclarRevisao(modelo, validacao);
  const por = Object.fromEntries(final.map((i) => [i.id, i]));

  it("o código prevalece sobre o modelo nos itens que ele verifica", () => {
    expect(por.cnj).toMatchObject({ situacao: "critico", fonte: "codigo", observacao: "número diferente do processo" });
    expect(por.docs).toMatchObject({ situacao: "critico", fonte: "codigo" });
    expect(por.lacunas).toMatchObject({ situacao: "ok", fonte: "codigo" });
  });

  it("o modelo mantém o julgamento dos itens que só ele pode dar", () => {
    expect(por.competencia).toMatchObject({ situacao: "atencao", fonte: "modelo", observacao: "rever vara" });
    expect(por.pedidos_correlacao).toMatchObject({ situacao: "critico", fonte: "modelo" });
  });

  it("item que o código marca como não aplicável some da lista", () => {
    expect(por.tempestividade).toBeUndefined();
  });

  it("ordena pela sequência do checklist e conta críticos sem justificativa", () => {
    expect(final.map((i) => i.id)).toEqual(["competencia", "oab", "cnj", "pedidos_correlacao", "docs", "lacunas"]);
    expect(criticosAbertos(final)).toBe(3);
    expect(criticosAbertos([{ ...por.cnj, justificativa: "conferido: é outro processo" }])).toBe(0);
  });
});
