import { describe, expect, it } from "vitest";
import { comarcaPorIbge, listarComarcasConhecidas, registrarComarca } from "../comarca-por-ibge";
import processoTjmt from "../mocks/processo-tjmt.json";
import { deduzirCompetencia, normalizarProcessoDatajud, ordenarMovimentos, paraDataIso, paraIso } from "../normalizar";
import { ProcessoDatajudSourceSchema, RespostaDatajudSchema } from "../tipos";

const source = RespostaDatajudSchema.parse(processoTjmt).hits.hits[0]._source;

describe("normalizarProcessoDatajud", () => {
  it("mapeia os campos do _source", () => {
    const p = normalizarProcessoDatajud(source);
    expect(p.numero_cnj).toBe("10045218820258110041");
    expect(p.tribunal).toBe("TJMT");
    expect(p.grau).toBe("G1");
    expect(p.classe_codigo).toBe(7);
    expect(p.classe_nome).toBe("Procedimento Comum Cível");
    expect(p.assuntos).toEqual([
      { codigo: 7779, nome: "Indenização por Dano Material" },
      { codigo: 7780, nome: "Indenização por Dano Moral" },
    ]);
    expect(p.sistema).toBe("PJe");
    expect(p.formato).toBe("Eletrônico");
    expect(p.data_ajuizamento).toBe("2025-03-14");
    expect(p.ultima_atualizacao).toBe("2026-10-27T03:12:44.517Z");
    expect(p.nivel_sigilo).toBe(0);
    expect(p.sigiloso).toBe(false);
    expect(p.orgao_julgador_codigo).toBe(11041);
    expect(p.orgao_julgador_nome).toBe("4ª Vara Cível de Cuiabá");
    expect(p.codigo_municipio_ibge).toBe(5103403);
    expect(p.comarca).toBe("Cuiabá");
    expect(p.competencia).toBe("vara_comum");
    expect(p.payload_bruto).toBe(source);
  });

  it("ordena movimentos por data decrescente e expõe o último", () => {
    const p = normalizarProcessoDatajud(source);
    expect(p.movimentos.map((m) => m.codigo)).toEqual([92, 123, 51, 60, 85, 26]);
    expect(p.ultimo_movimento).toEqual({
      codigo: 92,
      nome: "Publicação",
      data_hora: "2026-10-24T10:00:00.000Z",
      complementos: [],
    });
    const audiencia = p.movimentos.find((m) => m.codigo === 51)!;
    expect(audiencia.complementos).toEqual([{ codigo: 5, nome: "Instrução e Julgamento", valor: 11, descricao: "tipo_de_audiencia" }]);
  });

  it("marca sigiloso quando nivelSigilo > 0 e tolera campos ausentes", () => {
    const minimo = ProcessoDatajudSourceSchema.parse({ numeroProcesso: "10045218820258110041", nivelSigilo: 5 });
    const p = normalizarProcessoDatajud(minimo);
    expect(p.sigiloso).toBe(true);
    expect(p.nivel_sigilo).toBe(5);
    expect(p.movimentos).toEqual([]);
    expect(p.ultimo_movimento).toBeNull();
    expect(p.comarca).toBeNull();
    expect(p.assuntos).toEqual([]);
    expect(p.data_ajuizamento).toBeNull();
  });

  it("aceita hits.total numérico (versões antigas do Elasticsearch)", () => {
    const r = RespostaDatajudSchema.parse({ hits: { total: 3, hits: [] } });
    expect(r.hits.total).toEqual({ value: 3, relation: "eq" });
  });
});

describe("deduzirCompetencia", () => {
  it("juizado especial pelo órgão julgador ou pela classe, sem acento e sem caixa", () => {
    expect(deduzirCompetencia({ grau: "G1", orgaoJulgadorNome: "1º JUIZADO ESPECIAL CÍVEL DE CUIABÁ", classeNome: "Procedimento do Juizado Especial Cível" })).toBe("juizado_especial");
    expect(deduzirCompetencia({ grau: "JE", orgaoJulgadorNome: "Juízado Especial da Fazenda Pública", classeNome: null })).toBe("juizado_especial");
    expect(deduzirCompetencia({ grau: "G1", orgaoJulgadorNome: "Vara Única de Nobres", classeNome: "Procedimento do Juizado Especial Cível" })).toBe("juizado_especial");
  });

  it("recurso inominado é juizado mesmo em turma recursal ou câmara", () => {
    expect(deduzirCompetencia({ grau: "TR", orgaoJulgadorNome: "Turma Recursal Única", classeNome: "Recurso Inominado Cível" })).toBe("juizado_especial");
    // Só o código de grau já basta (JE/TR), mesmo com órgão que pareceria 2º grau
    expect(deduzirCompetencia({ grau: "TR", orgaoJulgadorNome: "Turma Mista", classeNome: null })).toBe("juizado_especial");
    expect(deduzirCompetencia({ grau: "JE", orgaoJulgadorNome: null, classeNome: null })).toBe("juizado_especial");
    expect(deduzirCompetencia({ grau: "G2", orgaoJulgadorNome: "2ª Câmara Cível", classeNome: "RECURSO INOMINADO" })).toBe("juizado_especial");
  });

  it("segundo grau pelo grau ou pelo órgão (turma, câmara)", () => {
    expect(deduzirCompetencia({ grau: "G2", orgaoJulgadorNome: "Gabinete do Des. X", classeNome: "Apelação Cível" })).toBe("segundo_grau");
    expect(deduzirCompetencia({ grau: "2", orgaoJulgadorNome: null, classeNome: null })).toBe("segundo_grau");
    expect(deduzirCompetencia({ grau: "Segundo Grau", orgaoJulgadorNome: null, classeNome: null })).toBe("segundo_grau");
    expect(deduzirCompetencia({ grau: null, orgaoJulgadorNome: "Primeira Câmara de Direito Privado", classeNome: "Apelação Cível" })).toBe("segundo_grau");
    expect(deduzirCompetencia({ grau: "G1", orgaoJulgadorNome: "Turma de Câmaras Cíveis Reunidas", classeNome: null })).toBe("segundo_grau");
  });

  it("vara comum no restante, inclusive sem dados", () => {
    expect(deduzirCompetencia({ grau: "G1", orgaoJulgadorNome: "4ª Vara Cível de Cuiabá", classeNome: "Procedimento Comum Cível" })).toBe("vara_comum");
    expect(deduzirCompetencia({ grau: "G1", orgaoJulgadorNome: "Vara Especializada de Família", classeNome: "Divórcio Litigioso" })).toBe("vara_comum");
    expect(deduzirCompetencia({})).toBe("vara_comum");
    // "turma" só conta como palavra inteira
    expect(deduzirCompetencia({ grau: "G1", orgaoJulgadorNome: "Vara da Turmalina", classeNome: null })).toBe("vara_comum");
  });

  it("entra no processo normalizado", () => {
    const juizado = ProcessoDatajudSourceSchema.parse({ numeroProcesso: "10045218820258110041", grau: "G1", orgaoJulgador: { nome: "Juizado Especial Cível de Sinop" } });
    expect(normalizarProcessoDatajud(juizado).competencia).toBe("juizado_especial");
    const segundo = ProcessoDatajudSourceSchema.parse({ numeroProcesso: "10045218820258110041", grau: "g2" });
    expect(normalizarProcessoDatajud(segundo).competencia).toBe("segundo_grau");
  });
});

describe("datas", () => {
  it("converte ISO e formato compacto", () => {
    expect(paraIso("2026-10-27T03:12:44.517Z")).toBe("2026-10-27T03:12:44.517Z");
    expect(paraIso("20261027031244")).toBe("2026-10-27T03:12:44.000Z");
    expect(paraIso("20261027")).toBe("2026-10-27T00:00:00.000Z");
    expect(paraIso("")).toBeNull();
    expect(paraIso("não é data")).toBeNull();
    expect(paraDataIso("2025-03-14T00:00:00.000Z")).toBe("2025-03-14");
    expect(paraDataIso(null)).toBeNull();
  });

  it("movimentos sem data vão para o fim", () => {
    const ordenados = ordenarMovimentos([
      { codigo: 1, nome: null, data_hora: null, complementos: [] },
      { codigo: 2, nome: null, data_hora: "2026-01-01T00:00:00.000Z", complementos: [] },
      { codigo: 3, nome: null, data_hora: "2026-02-01T00:00:00.000Z", complementos: [] },
    ]);
    expect(ordenados.map((m) => m.codigo)).toEqual([3, 2, 1]);
  });
});

describe("comarcaPorIbge", () => {
  it("resolve códigos conhecidos de MT", () => {
    expect(comarcaPorIbge(5103403)).toBe("Cuiabá");
    expect(comarcaPorIbge("5108402")).toBe("Várzea Grande");
    expect(comarcaPorIbge(5107909)).toBe("Sinop");
    expect(comarcaPorIbge(5105622)).toBe("Mirassol d'Oeste");
  });
  it("devolve null para desconhecidos e aceita registro em tempo de execução", () => {
    expect(comarcaPorIbge(9999999)).toBeNull();
    expect(comarcaPorIbge(null)).toBeNull();
    expect(comarcaPorIbge("abc")).toBeNull();
    registrarComarca(9999999, "Comarca de Teste");
    expect(comarcaPorIbge(9999999)).toBe("Comarca de Teste");
    expect(listarComarcasConhecidas().some((c) => c.nome === "Comarca de Teste")).toBe(true);
    expect(listarComarcasConhecidas().length).toBeGreaterThan(50);
  });
});
