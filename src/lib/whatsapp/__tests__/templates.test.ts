import { describe, expect, it } from "vitest";
import {
  AVISO_SIGILOSO,
  DEFINICOES_TEMPLATES,
  descreverDiasRestantes,
  formatarDataBR,
  montarEnvioTemplate,
  renderizarTemplate,
  sanitizarVariavel,
  TEMPLATES,
  variaveisAlertaPrazo,
  variaveisNovaPublicacao,
  variaveisPublicacaoSemTratamento,
  variaveisResumoDoDia,
  variaveisTarefaReatribuida,
} from "../templates";

describe("definições dos templates", () => {
  it("cobre exatamente os cinco templates do MVP, utility e pt_BR", () => {
    expect(Object.values(TEMPLATES).sort()).toEqual(
      ["alerta_prazo", "nova_publicacao", "publicacao_sem_tratamento", "resumo_do_dia", "tarefa_reatribuida"],
    );
    for (const nome of Object.values(TEMPLATES)) {
      const d = DEFINICOES_TEMPLATES[nome];
      expect(d.nome).toBe(nome);
      expect(d.categoria).toBe("UTILITY");
      expect(d.idioma).toBe("pt_BR");
    }
  });

  it("placeholders são sequenciais, batem com a contagem e com os exemplos", () => {
    for (const d of Object.values(DEFINICOES_TEMPLATES)) {
      const indices = [...d.corpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      expect(Math.max(...indices)).toBe(d.quantidadeVariaveis);
      expect(new Set(indices).size).toBe(d.quantidadeVariaveis);
      for (let i = 1; i <= d.quantidadeVariaveis; i++) expect(indices).toContain(i);
      expect(d.exemplo).toHaveLength(d.quantidadeVariaveis);
      // não começa nem termina com variável
      expect(d.corpo.startsWith("{{")).toBe(false);
      expect(d.corpo.trimEnd().endsWith("}}")).toBe(false);
    }
  });
});

describe("montagem de variáveis", () => {
  it("alerta_prazo descreve dias restantes e formata a data", () => {
    expect(
      variaveisAlertaPrazo({ ato: "Contestação", processoMascara: "0001234-56.2026.8.11.0041", dataFinal: "2026-11-02", diasRestantes: 3 }),
    ).toEqual(["Contestação", "0001234-56.2026.8.11.0041", "em 3 dias", "02/11/2026"]);
    expect(descreverDiasRestantes(0)).toBe("hoje");
    expect(descreverDiasRestantes(1)).toBe("amanhã");
    expect(descreverDiasRestantes(-1)).toBe("vencido há 1 dia");
    expect(descreverDiasRestantes(-4)).toBe("vencido há 4 dias");
  });

  it("nova_publicacao nunca envia resumo de processo sigiloso", () => {
    const vars = variaveisNovaPublicacao({
      processoMascara: "0001234-56.2026.8.11.0041",
      origem: "DJEN de 28/10/2026",
      resumo: "Intimação para audiência com a parte X.",
      sigiloso: true,
      linkPainel: "https://painel.local/p/1",
    });
    expect(vars[2]).toBe(AVISO_SIGILOSO);
    expect(vars.join(" ")).not.toContain("audiência");

    const semResumo = variaveisNovaPublicacao({ processoMascara: "x", origem: "y", resumo: "  ", sigiloso: false, linkPainel: "l" });
    expect(semResumo[2]).toBe("Veja o teor no painel.");
  });

  it("resumo_do_dia, tarefa_reatribuida e publicacao_sem_tratamento têm a contagem certa", () => {
    expect(
      variaveisResumoDoDia({ nome: "Ana", dataLocal: "28/10/2026", publicacoesNovas: 3, prazosHoje: 1, prazosAmanha: 2, tarefasAtrasadas: 0, linkPainel: "l" }),
    ).toEqual(["Ana", "28/10/2026", "3", "1", "2", "0", "l"]);
    expect(
      variaveisTarefaReatribuida({ tarefa: "Contestar", processoMascara: "p", reatribuidaPor: "Dra. Ana", dataInterna: "2026-10-30" }),
    ).toEqual(["Contestar", "p", "Dra. Ana", "30/10/2026"]);
    expect(variaveisPublicacaoSemTratamento({ processoMascara: "p", horasUteis: 24.7, responsavelNome: "Bruno", linkPainel: "l" })).toEqual([
      "p",
      "24",
      "Bruno",
      "l",
    ]);
  });

  it("sanitizarVariavel remove quebras de linha e espaços repetidos", () => {
    expect(sanitizarVariavel("a\nb\t c    d")).toBe("a b c d");
    expect(sanitizarVariavel("   ")).toBe("-");
    expect(sanitizarVariavel(12)).toBe("12");
  });

  it("formatarDataBR converte YYYY-MM-DD e preserva outros formatos", () => {
    expect(formatarDataBR("2026-10-30")).toBe("30/10/2026");
    expect(formatarDataBR("2026-10-30T12:00:00Z")).toBe("30/10/2026");
    expect(formatarDataBR("hoje")).toBe("hoje");
  });
});

describe("renderizarTemplate e montarEnvioTemplate", () => {
  it("substitui os placeholders", () => {
    const texto = renderizarTemplate("alerta_prazo", ["Contestação", "0001234-56.2026.8.11.0041", "hoje", "28/10/2026"]);
    expect(texto).toContain("Contestação no processo 0001234-56.2026.8.11.0041 vence hoje (28/10/2026)");
    expect(texto).not.toContain("{{");
  });

  it("falha quando a quantidade de variáveis não bate", () => {
    expect(() => renderizarTemplate("alerta_prazo", ["a"])).toThrow(/espera 4/);
    expect(() => montarEnvioTemplate("resumo_do_dia", [])).toThrow(/espera 7/);
  });

  it("monta o envio com idioma e componente body", () => {
    const envio = montarEnvioTemplate("tarefa_reatribuida", ["t", "p", "a", "30/10/2026"]);
    expect(envio.nome).toBe("tarefa_reatribuida");
    expect(envio.idioma).toBe("pt_BR");
    expect(envio.componentes[0].type).toBe("body");
    expect(envio.componentes[0].parameters).toHaveLength(4);
  });
});
