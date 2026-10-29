import { describe, expect, it } from "vitest";
import { montarPacoteTitular, nomeDoPacote, type DadosTitular } from "../exportar";
import {
  acaoDescarte,
  confirmarAnonimizacao,
  corteDoDescarte,
  descarteAutomatico,
  prazoMesesValido,
  tipoDadoValido,
  validarConfiguracaoPolitica,
} from "../retencao";

describe("corteDoDescarte", () => {
  it("subtrai meses dentro do mesmo ano", () => {
    expect(corteDoDescarte(new Date("2026-10-29T05:00:00.000Z"), 3)).toBe("2026-07-29T05:00:00.000Z");
  });

  it("atravessa o ano para trás", () => {
    expect(corteDoDescarte(new Date("2026-02-10T00:00:00.000Z"), 3)).toBe("2025-11-10T00:00:00.000Z");
  });

  it("limita o dia ao último dia do mês de destino (fevereiro)", () => {
    expect(corteDoDescarte(new Date("2026-03-31T00:00:00.000Z"), 1)).toBe("2026-02-28T00:00:00.000Z");
  });

  it("aceita fevereiro de ano bissexto", () => {
    expect(corteDoDescarte(new Date("2024-03-31T12:30:15.123Z"), 1)).toBe("2024-02-29T12:30:15.123Z");
  });

  it("recua vários anos (60 meses)", () => {
    expect(corteDoDescarte(new Date("2026-10-29T00:00:00.000Z"), 60)).toBe("2021-10-29T00:00:00.000Z");
  });
});

describe("validação de política de retenção", () => {
  it("reconhece tipos e prazos válidos", () => {
    expect(tipoDadoValido("mensagens_whatsapp")).toBe(true);
    expect(tipoDadoValido("tabela_inventada")).toBe(false);
    expect(prazoMesesValido(null)).toBe(true);
    expect(prazoMesesValido(1)).toBe(true);
    expect(prazoMesesValido(600)).toBe(true);
    expect(prazoMesesValido(0)).toBe(false);
    expect(prazoMesesValido(601)).toBe(false);
    expect(prazoMesesValido(2.5)).toBe(false);
  });

  it("bloqueia tipo desconhecido e prazo inválido", () => {
    expect(validarConfiguracaoPolitica({ tipo: "x", prazoMeses: 3, ativar: false, confirmacao: "" })).toMatch(/Tipo/);
    expect(validarConfiguracaoPolitica({ tipo: "webhooks_inbox", prazoMeses: 0, ativar: false, confirmacao: "" })).toMatch(/prazo/);
  });

  it("permite desativar, inclusive sem prazo", () => {
    expect(validarConfiguracaoPolitica({ tipo: "aprovacoes", prazoMeses: null, ativar: false, confirmacao: "" })).toBeNull();
    expect(validarConfiguracaoPolitica({ tipo: "webhooks_inbox", prazoMeses: 3, ativar: false, confirmacao: "" })).toBeNull();
  });

  it("exige prazo e a frase exata para ativar", () => {
    expect(validarConfiguracaoPolitica({ tipo: "webhooks_inbox", prazoMeses: null, ativar: true, confirmacao: "ATIVAR DESCARTE" })).toMatch(/prazo/);
    expect(validarConfiguracaoPolitica({ tipo: "webhooks_inbox", prazoMeses: 3, ativar: true, confirmacao: "sim" })).toMatch(/ATIVAR DESCARTE/);
    expect(validarConfiguracaoPolitica({ tipo: "webhooks_inbox", prazoMeses: 3, ativar: true, confirmacao: "  ATIVAR DESCARTE  " })).toBeNull();
  });
});

describe("ação do descarte", () => {
  it("apaga só política ativa, confirmada e de tipo automático", () => {
    expect(descarteAutomatico("mensagens_whatsapp")).toBe(true);
    expect(descarteAutomatico("processos_encerrados")).toBe(false);
    expect(descarteAutomatico("inexistente")).toBe(false);
    expect(acaoDescarte({ tipo: "mensagens_whatsapp", prazoMeses: 12, ativo: true, confirmado: true })).toBe("apagar");
  });

  it("apenas lista quando está desligada, sem confirmação ou sem descarte automático", () => {
    expect(acaoDescarte({ tipo: "mensagens_whatsapp", prazoMeses: 12, ativo: false, confirmado: false })).toBe("listar");
    expect(acaoDescarte({ tipo: "mensagens_whatsapp", prazoMeses: 12, ativo: true, confirmado: false })).toBe("listar");
    expect(acaoDescarte({ tipo: "processos_encerrados", prazoMeses: 60, ativo: true, confirmado: true })).toBe("listar");
  });

  it("não age quando não há prazo (sem descarte automático)", () => {
    expect(acaoDescarte({ tipo: "aprovacoes", prazoMeses: null, ativo: true, confirmado: true })).toBe("nao_agir");
  });
});

describe("confirmação de anonimização", () => {
  it("exige o nome exato do titular, ignorando espaços nas pontas", () => {
    expect(confirmarAnonimizacao("Maria Souza", "Maria Souza")).toBe(true);
    expect(confirmarAnonimizacao("  Maria Souza ", "Maria Souza")).toBe(true);
    expect(confirmarAnonimizacao("Maria", "Maria Souza")).toBe(false);
    expect(confirmarAnonimizacao("", "   ")).toBe(false);
  });
});

describe("pacote de exportação do titular", () => {
  const dados: DadosTitular = {
    cliente: {
      id: "c1",
      nome: "Maria Souza",
      tipo_pessoa: "fisica",
      cpf_cnpj: "00000000000",
      email: null,
      telefone_e164: "+5565999990000",
      endereco: { cidade: "Cuiabá" },
      observacoes: null,
      criado_em: "2026-01-01T00:00:00Z",
    },
    processos: [{ processo_id: "p1", numero_cnj: "00000000000000000000", polo: "ativo", nome_na_parte: "Maria Souza" }],
    documentos: [{ id: "d1", nome: "procuracao.pdf", tipo: "procuracao", mime: "application/pdf", tamanho: 10, criado_em: "2026-01-02" }],
  };

  it("gera LEIA-ME e os três JSON com os dados do titular", () => {
    const arquivos = montarPacoteTitular(dados, "2026-10-29T12:00:00.000Z");
    expect(arquivos.map((a) => a.nome)).toEqual(["LEIA-ME.txt", "titular.json", "processos.json", "documentos.json"]);
    const titular = JSON.parse(arquivos[1].conteudo);
    expect(titular.nome).toBe("Maria Souza");
    expect(JSON.parse(arquivos[2].conteudo)[0].polo).toBe("ativo");
    expect(JSON.parse(arquivos[3].conteudo)[0].nome).toBe("procuracao.pdf");
    expect(arquivos[0].conteudo).toContain("Gerada em: 2026-10-29T12:00:00.000Z");
  });

  it("gera nome de arquivo seguro e com data válida", () => {
    expect(nomeDoPacote("abc-123", "2026-10-29")).toBe("titular-abc-123-2026-10-29.zip");
    expect(nomeDoPacote("a/b\\c.d", "2026-10-29")).toBe("titular-abcd-2026-10-29.zip");
    expect(nomeDoPacote("abc", "29/10/2026")).toBe("titular-abc-data-invalida.zip");
  });
});
