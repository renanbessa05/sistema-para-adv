import { describe, expect, it } from "vitest";
import { escaparHtml, montarResumoDoDia } from "../resumo";

const base = {
  nome: "Ana",
  publicacoesNovas: 2,
  prazosHoje: [{ processoMascara: "0001234-56.2026.8.11.0041", ato: "Contestação", dataFinal: "2026-10-28", dataInterna: "2026-10-26" }],
  prazosAmanha: [{ processoMascara: "0009876-54.2026.8.11.0002", ato: "Réplica", dataFinal: "2026-10-29" }],
  prazosSemana: 4,
  tarefasAtrasadas: [{ titulo: "Juntar procuração", processoMascara: "0001111-22.2026.8.11.0041", dataInterna: "2026-10-27" }],
  linkPainel: "https://painel.local/dia",
  dataLocal: "quarta-feira, 28/10",
};

describe("montarResumoDoDia", () => {
  it("gera texto curto para WhatsApp com contadores, itens e link", () => {
    const r = montarResumoDoDia(base);
    expect(r.whatsapp).toContain("Bom dia, Ana! Resumo de quarta-feira, 28/10");
    expect(r.whatsapp).toContain("2 publicações novas");
    expect(r.whatsapp).toContain("1 prazo hoje");
    expect(r.whatsapp).toContain("Contestação - 0001234-56.2026.8.11.0041 - 28/10 (interna 26/10)");
    expect(r.whatsapp).toContain("1 prazo amanhã");
    expect(r.whatsapp).toContain("4 prazos na semana");
    expect(r.whatsapp).toContain("Juntar procuração - 0001111-22.2026.8.11.0041 - venceu 27/10");
    expect(r.whatsapp).toContain("Painel: https://painel.local/dia");
    expect(r.whatsapp).not.toMatch(/\*\*|__|#/);
    expect(r.totais).toEqual({ publicacoesNovas: 2, prazosHoje: 1, prazosAmanha: 1, prazosSemana: 4, tarefasAtrasadas: 1 });
  });

  it("limita itens por bloco e informa quantos faltam", () => {
    const muitos = Array.from({ length: 7 }, (_, i) => ({ processoMascara: `000000${i}-00.2026.8.11.0041`, ato: `Ato ${i}`, dataFinal: "2026-10-28" }));
    const r = montarResumoDoDia({ ...base, prazosHoje: muitos, limiteItens: 3 });
    expect(r.whatsapp).toContain("Ato 2");
    expect(r.whatsapp).not.toContain("Ato 3");
    expect(r.whatsapp).toContain("... e 4 mais");
    // e-mail lista tudo
    expect(r.emailHtml).toContain("Ato 6");
  });

  it("dia sem pendências tem mensagem única", () => {
    const r = montarResumoDoDia({ ...base, publicacoesNovas: 0, prazosHoje: [], prazosAmanha: [], prazosSemana: [], tarefasAtrasadas: [] });
    expect(r.whatsapp).toContain("Nada pendente");
    expect(r.whatsapp).not.toContain("prazos na semana");
    expect(r.emailHtml).toContain("Nada pendente");
  });

  it("e-mail em HTML simples escapa conteúdo e aceita lista da semana", () => {
    const r = montarResumoDoDia({
      ...base,
      nome: "<Ana & Cia>",
      prazosSemana: [{ processoMascara: "p", ato: "Agravo <interno>", dataFinal: "2026-10-30" }],
    });
    expect(r.emailHtml).toContain("Bom dia, &lt;Ana &amp; Cia&gt;!");
    expect(r.emailHtml).toContain("Agravo &lt;interno&gt;");
    expect(r.emailHtml).toContain('<a href="https://painel.local/dia">Abrir o painel</a>');
    expect(r.emailHtml).toContain("1 prazo na semana");
    expect(r.emailAssunto).toBe("Resumo de quarta-feira, 28/10: 1 prazo hoje, 2 publicações novas");
  });

  it("escaparHtml cobre os cinco caracteres", () => {
    expect(escaparHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
