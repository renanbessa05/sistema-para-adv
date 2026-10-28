import { describe, expect, it } from "vitest";
import pagina1 from "../mocks/comunicacao-pagina1.json";
import pagina2 from "../mocks/comunicacao-pagina2.json";
import { decodificarEntidadesHtml, htmlParaTexto, normalizarData, normalizarPublicacaoDjen } from "../normalizar";
import { ItemDjenSchema, RespostaDjenSchema } from "../tipos";

const itens1 = RespostaDjenSchema.parse(pagina1).items;
const itens2 = RespostaDjenSchema.parse(pagina2).items;

describe("normalizarPublicacaoDjen", () => {
  it("preenche os campos principais a partir do item", () => {
    const p = normalizarPublicacaoDjen(itens1[0]);
    expect(p.fonte).toBe("djen");
    expect(p.id_externo).toBe("418233001");
    expect(p.hash_djen).toBe(itens1[0].hash);
    expect(p.numero_cnj).toBe("10045218820258110041");
    expect(p.numero_processo_texto).toBe("1004521-88.2025.8.11.0041");
    expect(p.tribunal_sigla).toBe("TJMT");
    expect(p.tipo_origem).toBe("Intimação");
    expect(p.tipo_documento).toBe("Despacho");
    expect(p.orgao).toBe("4ª Vara Cível de Cuiabá");
    expect(p.classe_nome).toBe("PROCEDIMENTO COMUM CÍVEL");
    expect(p.classe_codigo).toBe("7");
    expect(p.meio).toBe("D");
    expect(p.data_disponibilizacao).toBe("2026-10-27");
    expect(p.link).toMatch(/^https:\/\/pje\.tjmt/);
    expect(p.destinatarios).toEqual([
      { nome: "HELENA FICTÍCIA DE ALMEIDA", polo: "A" },
      { nome: "COMERCIAL EXEMPLO LTDA", polo: "P" },
    ]);
    expect(p.destinatario_advogados).toEqual([{ nome: "MARIA EXEMPLO DA SILVA", numero_oab: "12345", uf_oab: "MT" }]);
    expect(p.ativo).toBe(true);
    expect(p.status).toBe("P");
    expect(p.cancelada).toBe(false);
    expect(p.numero_comunicacao).toBe(2026102700001);
    expect(p.payload_bruto).toBe(itens1[0]);
    expect(p.texto_html).toBe(itens1[0].texto);
  });

  it("converte HTML em texto simples, decodificando entidades e normalizando espaços", () => {
    const p = normalizarPublicacaoDjen(itens1[0]);
    expect(p.texto).not.toMatch(/<|&[a-z]+;/);
    expect(p.texto).toContain("PODER JUDICIÁRIO DO ESTADO DE MATO GROSSO");
    expect(p.texto).toContain("COMARCA DE CUIABÁ - 4ª VARA CÍVEL");
    expect(p.texto).toContain("Processo nº 1004521-88.2025.8.11.0041");
    expect(p.texto).toContain("apresentar impugnação à contestação");
    // Quebras de parágrafo viram quebras de linha simples; sem linhas vazias.
    expect(p.texto.split("\n")[0]).toBe("PODER JUDICIÁRIO DO ESTADO DE MATO GROSSO");
    expect(p.texto).not.toMatch(/\n\n/);
    expect(p.texto).not.toMatch(/ {2}/);
  });

  it("marca como cancelada quando ativo=false, status C ou há motivo/data de cancelamento", () => {
    const cancelada = normalizarPublicacaoDjen(itens1[2]);
    expect(cancelada.cancelada).toBe(true);
    expect(cancelada.motivo_cancelamento).toMatch(/duplicidade/);
    expect(cancelada.data_cancelamento).toBe("2026-10-27");

    const base = ItemDjenSchema.parse({ id: 1, hash: "x" });
    expect(normalizarPublicacaoDjen(base).cancelada).toBe(false);
    expect(normalizarPublicacaoDjen({ ...base, ativo: false }).cancelada).toBe(true);
    expect(normalizarPublicacaoDjen({ ...base, status: "C" }).cancelada).toBe(true);
    expect(normalizarPublicacaoDjen({ ...base, motivo_cancelamento: "erro" }).cancelada).toBe(true);
    expect(normalizarPublicacaoDjen({ ...base, data_cancelamento: "2026-01-01" }).cancelada).toBe(true);
    expect(normalizarPublicacaoDjen({ ...base, ativo: true, status: "P" }).cancelada).toBe(false);
  });

  it("extrai o CNJ do número com máscara ou do número sem máscara; null quando não há 20 dígitos", () => {
    const base = ItemDjenSchema.parse({ id: 1, hash: "x" });
    expect(normalizarPublicacaoDjen({ ...base, numeroprocessocommascara: "1004521-88.2025.8.11.0041" }).numero_cnj).toBe(
      "10045218820258110041",
    );
    expect(normalizarPublicacaoDjen({ ...base, numero_processo: "10045218820258110041" }).numero_cnj).toBe(
      "10045218820258110041",
    );
    const semNumero = normalizarPublicacaoDjen({ ...base, numeroprocessocommascara: "Edital sem processo", numero_processo: "123" });
    expect(semNumero.numero_cnj).toBeNull();
    expect(semNumero.numero_processo_texto).toBe("Edital sem processo");
    expect(normalizarPublicacaoDjen(base).numero_cnj).toBeNull();
    expect(normalizarPublicacaoDjen(base).numero_processo_texto).toBeNull();
  });

  it("converte a data brasileira quando a ISO não vem", () => {
    const base = ItemDjenSchema.parse({ id: 1, hash: "x", datadisponibilizacao: "05/03/2026" });
    expect(normalizarPublicacaoDjen(base).data_disponibilizacao).toBe("2026-03-05");
    expect(normalizarData(null, null)).toBeNull();
    expect(normalizarData("2026-10-28T00:00:00", null)).toBe("2026-10-28");
    expect(normalizarData("28/10/2026", null)).toBe("2026-10-28");
    expect(normalizarData(null, "2026-10-28")).toBe("2026-10-28");
  });

  it("aceita campos extras e ausentes (schema permissivo)", () => {
    const item = ItemDjenSchema.parse({ id: 9, hash: "h", campoNovo: { qualquer: 1 }, codigoClasse: 7, numero_oab: 1 });
    const p = normalizarPublicacaoDjen(item);
    expect(p.classe_codigo).toBe("7");
    expect(p.texto).toBe("");
    expect(p.destinatarios).toEqual([]);
    expect(p.destinatario_advogados).toEqual([]);
    expect((p.payload_bruto as Record<string, unknown>).campoNovo).toEqual({ qualquer: 1 });
  });

  it("edital e processo sigiloso da página 2", () => {
    const edital = normalizarPublicacaoDjen(itens2[1]);
    expect(edital.meio).toBe("E");
    expect(edital.tipo_origem).toBe("Edital");
    expect(edital.texto).toContain("EDITAL DE CITAÇÃO – PRAZO DE 20 DIAS");
    const familia = normalizarPublicacaoDjen(itens2[0]);
    expect(familia.texto).toContain("segredo de justiça (CPC, art. 189, II)");
    expect(familia.destinatario_advogados[0].uf_oab).toBe("MT");
  });
});

describe("htmlParaTexto", () => {
  it("remove script/style e comentários", () => {
    expect(htmlParaTexto("<style>p{}</style><p>a</p><script>x()</script><!-- c --><p>b</p>")).toBe("a\nb");
  });
  it("trata tabelas e quebras", () => {
    expect(htmlParaTexto("<table><tr><td>A</td><td>B</td></tr><tr><td>C</td></tr></table>")).toBe("A B\nC");
    expect(htmlParaTexto("linha1<br>linha2<br/>  linha3  ")).toBe("linha1\nlinha2\nlinha3");
  });
  it("decodifica entidades numéricas e nomeadas", () => {
    expect(decodificarEntidadesHtml("&#67;&#x41;&nbsp;&amp;&Ccedil;&sect;&desconhecida;")).toBe("CA &Ç§&desconhecida;");
  });
  it("devolve string vazia para null", () => {
    expect(htmlParaTexto(null)).toBe("");
    expect(htmlParaTexto(undefined)).toBe("");
  });
});
