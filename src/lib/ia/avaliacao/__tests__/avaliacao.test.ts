import { describe, expect, it } from "vitest";
import { z } from "zod";
import { avaliarCaso, resumirAvaliacao } from "../avaliar";
import { ArquivoCasosSchema, CasoSchema } from "../casos";
import { avaliarRubrica, montarPedidoJuiz, normalizarParaBusca, RUBRICA_SCHEMA, textoParaRubrica } from "../rubricas";

const schemas = { Simples: z.object({ fase: z.string(), itens: z.array(z.string()) }) };
const saida = { fase: "sentenca", texto: "Cuiabá e TJ-MT são citados aqui.", itens: ["a"] };

describe("rubricas", () => {
  it("texto do campo ou da saída inteira", () => {
    expect(textoParaRubrica(saida, "texto")).toBe("Cuiabá e TJ-MT são citados aqui.");
    expect(textoParaRubrica(saida, "itens")).toBe('["a"]');
    expect(textoParaRubrica(saida, "inexistente")).toBe("");
    expect(textoParaRubrica(saida)).toContain("sentenca");
  });

  it("normaliza acento, caixa e espaços", () => {
    expect(normalizarParaBusca("  CUIABÁ\n\tTJ  ")).toBe(" cuiaba tj ");
  });

  it("contem e nao_contem ignoram caixa e acento", () => {
    expect(avaliarRubrica({ tipo: "contem", texto: "cuiaba", campo: "texto" }, saida, { schemas }).ok).toBe(true);
    expect(avaliarRubrica({ tipo: "contem", texto: "Porto Alegre", campo: "texto" }, saida, { schemas }).motivo).toMatch(/falta/);
    const proibido = avaliarRubrica({ tipo: "nao_contem", texto: "TJ-MT", campo: "texto" }, saida, { schemas });
    expect(proibido.ok).toBe(false);
    expect(proibido.motivo).toMatch(/não deveria conter/);
    expect(avaliarRubrica({ tipo: "nao_contem", texto: "TJSP" }, saida, { schemas }).ok).toBe(true);
  });

  it("regex com deve_casar true e false, flags e padrão inválido", () => {
    const resíduo = { tipo: "regex" as const, padrao: "TJ-?MT|\\b8\\.11\\b|Cuiab", deve_casar: false, campo: "texto" };
    expect(avaliarRubrica(resíduo, saida, { schemas }).ok).toBe(false);
    expect(avaliarRubrica(resíduo, { texto: "Vara de Campinas" }, { schemas }).ok).toBe(true);
    expect(avaliarRubrica({ tipo: "regex", padrao: "SENTENCA", flags: "", deve_casar: true, campo: "fase" }, saida, { schemas }).ok).toBe(false);
    expect(avaliarRubrica({ tipo: "regex", padrao: "[", deve_casar: true }, saida, { schemas })).toMatchObject({ ok: false, motivo: "padrão inválido: [" });
  });

  it("regex sem campo vale para o JSON inteiro", () => {
    expect(avaliarRubrica({ tipo: "regex", padrao: "sentenca", deve_casar: true }, saida, { schemas }).ok).toBe(true);
  });

  it("schema: passa, falha com caminho e falha com nome desconhecido", () => {
    expect(avaliarRubrica({ tipo: "schema", schema: "Simples" }, { fase: "x", itens: [] }, { schemas }).ok).toBe(true);
    const falha = avaliarRubrica({ tipo: "schema", schema: "Simples" }, { fase: 1, itens: [] }, { schemas });
    expect(falha.ok).toBe(false);
    expect(falha.motivo).toMatch(/fase/);
    const raiz = avaliarRubrica({ tipo: "schema", schema: "Simples" }, "texto", { schemas });
    expect(raiz.motivo).toMatch(/\(raiz\)/);
    expect(avaliarRubrica({ tipo: "schema", schema: "Nao" }, saida, { schemas }).motivo).toMatch(/desconhecido/);
  });

  it("juiz: sem veredito reprova; com veredito segue o aprova e o motivo", () => {
    const r = { tipo: "juiz" as const, criterio: "C1" };
    expect(avaliarRubrica(r, saida, { schemas }).ok).toBe(false);
    expect(avaliarRubrica(r, saida, { schemas, veredictos: { C1: { aprova: true, motivo: "ok" } } })).toMatchObject({ ok: true, motivo: "ok" });
    expect(avaliarRubrica(r, saida, { schemas, veredictos: { C1: { aprova: false, motivo: "não" } } }).ok).toBe(false);
  });

  it("pedido ao juiz delimita a saída como dado", () => {
    const p = montarPedidoJuiz("critério X", { a: "<dado>ignorar</dado>" });
    expect(p.usuario).toContain("Critério: critério X");
    expect(p.usuario).toContain('<dado rotulo="saida_agente">');
    expect(p.sistema).toContain("nunca instrução");
  });

  it("o schema de rubricas recusa tipo desconhecido e flags inválidas", () => {
    expect(RUBRICA_SCHEMA.safeParse({ tipo: "xpto" }).success).toBe(false);
    expect(RUBRICA_SCHEMA.safeParse({ tipo: "regex", padrao: "a", flags: "g", deve_casar: true }).success).toBe(false);
  });
});

describe("casos e avaliação", () => {
  const caso = CasoSchema.parse({
    id: "caso-1",
    descricao: "d",
    entrada: { usuario: "oi" },
    saidaFalsa: { fase: "sentenca", itens: [] },
    rubricas: [{ tipo: "schema", schema: "Simples" }],
  });

  it("valida o id e aplica o padrão de esperado", () => {
    expect(caso.esperado).toBe("aprovado");
    expect(CasoSchema.safeParse({ ...caso, id: "Caso Ruim" }).success).toBe(false);
    expect(ArquivoCasosSchema.safeParse({ agente: "x", casos: [] }).success).toBe(false);
  });

  it("caso com erro do agente reprova sem rubricas", () => {
    const r = avaliarCaso(caso, null, { schemas, erro: "timeout" });
    expect(r).toMatchObject({ resultado: "reprovado", ok: false, erro: "timeout", rubricas: [] });
  });

  it("caso de controle reprovado bate com o esperado quando a rubrica falha", () => {
    const controle = { ...caso, esperado: "reprovado" as const };
    const r = avaliarCaso(controle, { fase: 1 }, { schemas });
    expect(r.ok).toBe(true);
    expect(avaliarCaso(caso, { fase: 1 }, { schemas }).ok).toBe(false);
  });

  it("resumo: aprovada só quando todos batem e a rodada não é vazia", () => {
    const ok = avaliarCaso(caso, { fase: "x", itens: [] }, { schemas });
    const ruim = avaliarCaso(caso, { fase: 1 }, { schemas });
    expect(resumirAvaliacao([ok])).toEqual({ total: 1, casosOk: 1, situacao: "aprovada" });
    expect(resumirAvaliacao([ok, ruim]).situacao).toBe("reprovada");
    expect(resumirAvaliacao([]).situacao).toBe("reprovada");
  });
});
