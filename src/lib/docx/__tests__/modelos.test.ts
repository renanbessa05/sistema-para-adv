import { describe, expect, it } from "vitest";
import mammoth from "mammoth";
import { contratoHonorariosMarkdown, dataPorExtenso } from "../modelos/contrato";
import { procuracaoMarkdown, PODERES_POR_MATERIA } from "../modelos/procuracao";
import { declaracaoHipossuficienciaMarkdown } from "../modelos/declaracao";
import { qualificacaoCliente } from "../modelos/qualificacao";
import type { DadosContrato, QualificacaoCliente } from "../modelos/dados";
import { markdownParaDocx, paragrafosDoMarkdown, trechosInline } from "../markdown";
import { verificarMarcadores, ouLacuna } from "../marcadores";
import { enderecoTimbre, formatarCep, formatarCnpj, formatarCpf, linhasTimbre, TIMBRE_VAZIO, type Timbre } from "../timbre";

const timbre: Timbre = { ...TIMBRE_VAZIO, nome: "Escritório Teste", razaoSocial: "Escritório Teste Sociedade Individual de Advocacia", cnpj: "52559223000197", endereco: "Rua das Flores, nº 10", bairro: "Centro", cidade: "Cuiabá", uf: "MT", cep: "78000000", telefone: "(65) 99999-0000", email: "contato@teste.adv.br", advogadaNome: "Ana Teste", advogadaOab: "12.345-O", advogadaNacionalidade: "brasileira", advogadaEstadoCivil: "solteira", advogadaCpf: "12345678909", advogadaEmail: "ana@teste.adv.br" };

const cliente: QualificacaoCliente = { tipoPessoa: "fisica", nome: "Marina Silva", nacionalidade: "brasileira", estadoCivil: "solteira", profissao: "auxiliar administrativa", cpfCnpj: "00000000191", logradouro: "Rua A", numero: "1", complemento: null, bairro: "Jardim", cidade: "Várzea Grande", uf: "MT", cep: "78100000", email: "marina@x.com", telefone: "+5565999990000", representante: null, representanteQualificacao: null, instrumentoRepresentacao: null };

function dados(parcial: Partial<DadosContrato["honorarios"]> = {}, extra: Partial<DadosContrato> = {}): DadosContrato {
  return {
    timbre,
    cliente,
    objeto: { atuacao: "propositura e acompanhamento", tipoDemanda: "ação de indenização por danos morais", parteContraria: "Lojas Exemplo Ltda.", processoCnj: null, juizo: "1ª Vara Cível de Cuiabá", pedidos: ["condenar a ré a indenizar", "excluir a negativação"], exclusoes: null },
    honorarios: { modalidade: "fixo", valorFixo: 10712.56, percentual: null, parcelas: null, primeiraParcelaEm: null, diaVencimento: null, urhEquivalente: 8, valorUrh: 1339.07, abaterEntrada: false, descontosLegais: null, exclusoesBase: [], reajuste: "pela variação da URH", ...parcial },
    gratuidade: true,
    comarcaForo: "Várzea Grande",
    comarcaSede: "Cuiabá",
    fatoEssencialDeclarado: null,
    instrumentoDestaque: "alvará",
    dataAssinatura: null,
    ...extra,
  };
}

describe("qualificação e timbre", () => {
  it("qualificação idêntica entre documentos; contatos conforme a política", () => {
    const noContrato = qualificacaoCliente(cliente, { contatos: "escritorio", timbre, papel: "CONTRATANTE" });
    expect(noContrato).toContain("contato@teste.adv.br");
    expect(noContrato).not.toContain("marina@x.com");
    expect(noContrato).toContain("**MARINA SILVA**, brasileira, solteira, auxiliar administrativa, inscrito(a) no CPF sob o nº 000.000.001-91");
    const naDeclaracao = qualificacaoCliente(cliente, { contatos: "nenhum" });
    expect(naDeclaracao).not.toMatch(/endereço eletrônico|telefone/);
    expect(qualificacaoCliente(cliente, { contatos: "cliente" })).toContain("marina@x.com");
    const pj = qualificacaoCliente({ ...cliente, tipoPessoa: "juridica", nome: "Empresa X Ltda.", cpfCnpj: "52559223000197", representante: "João", representanteQualificacao: "brasileiro, empresário", instrumentoRepresentacao: "contrato social" }, { contatos: "nenhum" });
    expect(pj).toContain("CNPJ sob o nº 52.559.223/0001-97");
    expect(pj).toContain("representada por João");
  });

  it("formata CNPJ, CPF, CEP e monta cabeçalho e rodapé", () => {
    expect(formatarCnpj("52559223000197")).toBe("52.559.223/0001-97");
    expect(formatarCnpj("123")).toBe("123");
    expect(formatarCpf("00000000191")).toBe("000.000.001-91");
    expect(formatarCep("78000000")).toBe("78.000-000");
    expect(formatarCnpj(null)).toBeNull();
    expect(enderecoTimbre(timbre)).toBe("Rua das Flores, nº 10, Bairro Centro, Cuiabá/MT, CEP 78.000-000");
    const l = linhasTimbre(timbre);
    expect(l.cabecalho[0]).toBe("ESCRITÓRIO TESTE SOCIEDADE INDIVIDUAL DE ADVOCACIA");
    expect(l.rodape[1]).toContain("contato@teste.adv.br");
    expect(linhasTimbre({ ...TIMBRE_VAZIO, nome: "X" })).toEqual({ cabecalho: ["X"], rodape: [] });
    expect(enderecoTimbre(TIMBRE_VAZIO)).toBeNull();
  });

  it("marcadores: lacunas unificadas, [[CAMPO]] e [____]", () => {
    expect(ouLacuna("", "x")).toBe("[[VERIFICAR: x]]");
    expect(ouLacuna(5, "x")).toBe("5");
    const p = verificarMarcadores("a [[VERIFICAR: cpf]] b [[NOME]] c [_____] d");
    expect(p.map((x) => x.texto)).toEqual(["[[VERIFICAR: cpf]]", "[[NOME]]", "[_____]"]);
    expect(verificarMarcadores("limpo")).toEqual([]);
  });
});

describe("contrato", () => {
  it("valor fixo: bloco A, sem cláusula de êxito, com gratuidade e política antifraude", () => {
    const md = contratoHonorariosMarkdown(dados());
    expect(md).toContain("R$ 10.712,56 (dez mil, setecentos e doze reais e cinquenta e seis centavos)");
    expect(md).toContain("correspondente a 8 URH");
    expect(md).toContain("à vista, na assinatura");
    expect(md).not.toContain("DA CONFIGURAÇÃO DO ÊXITO");
    expect(md).toContain("CLÁUSULA TERCEIRA — DO PAGAMENTO E DO DESTAQUE");
    expect(md).toContain("a gratuidade da justiça não alcança os honorários contratuais");
    expect(md).toContain("jamais solicitará depósito");
    expect(md).toContain("foro da Comarca de **Várzea Grande**");
    expect(md).toContain("ESCRITÓRIO TESTE SOCIEDADE INDIVIDUAL DE ADVOCACIA");
    expect(verificarMarcadores(md)).toEqual([]);
  });

  it("êxito: bloco B com percentual por extenso e cláusula terceira; misto: entrada + êxito", () => {
    const exito = contratoHonorariosMarkdown(dados({ modalidade: "exito", valorFixo: null, percentual: 30 }, { gratuidade: false }));
    expect(exito).toContain("**30% (trinta por cento)** do proveito econômico líquido");
    expect(exito).toContain("CLÁUSULA TERCEIRA — DA CONFIGURAÇÃO DO ÊXITO");
    expect(exito).toContain("CLÁUSULA QUARTA — DO PAGAMENTO");
    expect(exito).not.toContain("gratuidade da justiça não alcança");
    const misto = contratoHonorariosMarkdown(dados({ modalidade: "misto", valorFixo: 3000, percentual: 15, parcelas: 3 }));
    expect(misto).toContain("Honorários iniciais");
    expect(misto).toContain("em 3 (três) parcelas mensais de R$ 1.000,00");
    expect(misto).toContain("**não serão abatidos**");
    expect(misto).toContain("**15% (quinze por cento)**");
    const parcelado = contratoHonorariosMarkdown(dados({ modalidade: "fixo_parcelado", parcelas: 4, primeiraParcelaEm: "2026-11-10", diaVencimento: 10 }));
    expect(parcelado).toContain("em 4 (quatro) parcelas mensais e sucessivas de R$ 2.678,14");
    expect(parcelado).toContain("vencendo a primeira em 10/11/2026");
  });

  it("dado faltante vira lacuna, nunca invenção", () => {
    const md = contratoHonorariosMarkdown(dados({ valorFixo: null }, { comarcaForo: null, cliente: { ...cliente, cpfCnpj: null } }));
    const p = verificarMarcadores(md).map((x) => x.texto);
    expect(p).toEqual(expect.arrayContaining(["[[VERIFICAR: valor fixo]]", "[[VERIFICAR: comarca do domicílio do cliente]]", "[[VERIFICAR: CPF]]"]));
  });
});

describe("procuração e declaração", () => {
  it("procuração em parágrafo único com poderes específicos e contatos conforme escolha", () => {
    const md = procuracaoMarkdown({ timbre, cliente, contatos: "nenhum", orgaosDoCaso: "INSS", poderesEspecificos: [PODERES_POR_MATERIA.previdenciario.texto], dataPorExtenso: dataPorExtenso("2026-10-29") });
    expect(md).toContain("(em especial INSS)");
    expect(md).toContain("**requerer benefícios perante o INSS");
    expect(md).toContain("29 de outubro de 2026");
    expect(md).toContain("**Outorgada:** **ESCRITÓRIO TESTE SOCIEDADE INDIVIDUAL DE ADVOCACIA**");
    expect(md.split("**Outorgante:**")[1].split("**Outorgada:**")[0]).not.toContain("marina@x.com");
    expect(verificarMarcadores(md)).toEqual([]);
  });

  it("declaração não menciona honorários nem contatos; pessoa jurídica é recusada", () => {
    const md = declaracaoHipossuficienciaMarkdown({ cliente, comarca: "Várzea Grande", uf: "MT" });
    expect(md).not.toMatch(/honorários/i);
    expect(md).not.toMatch(/telefone|eletrônico/);
    expect(md).toContain("custas e as despesas processuais");
    expect(md).toContain("CPF nº 000.000.001-91");
    expect(() => declaracaoHipossuficienciaMarkdown({ cliente: { ...cliente, tipoPessoa: "juridica" }, comarca: null, uf: null })).toThrow(/Súmula 481/);
  });
});

describe("markdown → docx", () => {
  it("gera um .docx que abre e preserva o texto, títulos, listas e negrito", async () => {
    const md = contratoHonorariosMarkdown(dados());
    const bytes = await markdownParaDocx(md, timbre, { titulo: "Contrato" });
    expect(bytes.byteLength).toBeGreaterThan(5000);
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    expect(value).toContain("CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS");
    expect(value).toContain("MARINA SILVA");
    expect(value).toContain("CLÁUSULA PRIMEIRA");
    expect(value).not.toContain("**");
    expect(value).not.toContain("[[");
  }, 30_000);

  it("parseia inline e blocos", () => {
    expect(trechosInline("a **b** c *d*")).toHaveLength(4);
    expect(trechosInline("")).toHaveLength(1);
    const ps = paragrafosDoMarkdown("# T\n\ntexto\n\n- item\n1. um\n\n> cit\n\n---\n[[pagebreak]]\nfim");
    expect(ps.length).toBe(8);
  });
});
