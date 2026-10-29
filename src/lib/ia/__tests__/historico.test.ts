import { describe, expect, it } from "vitest";
import { contarTurnos, montarHistorico, normalizarAlternancia, precisaResumo, type LinhaMensagem } from "../historico";

describe("histórico do chat", () => {
  it("reconstrói pessoa, assistente (blocos inteiros) e resultados de ferramenta na ordem", () => {
    const blocosAssistente = [
      { type: "text", text: "Vou consultar." },
      { type: "tool_use", id: "t1", name: "listar_prazos", input: { periodo: "semana" } },
    ];
    const resultadoFerramenta = [{ type: "tool_result", tool_use_id: "t1", content: "<dado>prazos</dado>" }];
    const linhas: LinhaMensagem[] = [
      { direcao: "entrada", tipo: "text", texto: "meus prazos?", payload: null },
      { direcao: "saida", tipo: "ferramenta", texto: "", payload: blocosAssistente },
      { direcao: "saida", tipo: "ferramenta", texto: "", payload: resultadoFerramenta },
      { direcao: "saida", tipo: "text", texto: "Você tem 1 prazo.", payload: [{ type: "text", text: "Você tem 1 prazo." }] },
      { direcao: "saida", tipo: "sistema", texto: "aviso", payload: null },
    ];
    const h = montarHistorico(linhas);
    expect(h.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(h[1].content).toEqual(blocosAssistente);
    expect(h[2].content).toEqual(resultadoFerramenta);
  });

  it("resumo entra como dado delimitado e mensagens vazias somem", () => {
    const h = montarHistorico([
      { direcao: "entrada", tipo: "resumo", texto: "Pessoa: oi\nAssistente: olá", payload: null },
      { direcao: "entrada", tipo: "text", texto: "   ", payload: null },
    ]);
    expect(h).toHaveLength(1);
    expect(String(h[0].content)).toContain('<dado rotulo="resumo_conversa_anterior">');
  });

  it("junta papéis seguidos e descarta assistente inicial órfão", () => {
    const n = normalizarAlternancia([
      { role: "assistant", content: "órfã" },
      { role: "user", content: "a" },
      { role: "user", content: [{ type: "text", text: "b" }] },
      { role: "assistant", content: "c" },
    ]);
    expect(n.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(n[0].content).toEqual([{ type: "text", text: "a" }, { type: "text", text: "b" }]);
  });

  it("conta turnos e decide o resumo", () => {
    const linhas: LinhaMensagem[] = Array.from({ length: 31 }, (_, i) => ({ direcao: i % 2 === 0 ? "entrada" : "saida", tipo: "text", texto: "x", payload: null }));
    expect(contarTurnos(linhas)).toBe(16);
    expect(precisaResumo(16)).toBe(false);
    expect(precisaResumo(30)).toBe(true);
  });
});
