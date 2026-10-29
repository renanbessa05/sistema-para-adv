import { describe, expect, it } from "vitest";
import { z } from "zod";
import { criarClienteIaFalso, ErroIa, textoDaMensagem, type FerramentaIa } from "../cliente";
import { contarLacunas, listarLacunas, normalizarLacunas } from "../lacunas";
import { AGENTES, definicaoAgente } from "../agentes/registro";

const listarPrazos: FerramentaIa<z.ZodObject<{ periodo: z.ZodEnum<{ hoje: "hoje"; semana: "semana" }> }>> = {
  nome: "listar_prazos",
  descricao: "Lista os prazos do período",
  schema: z.object({ periodo: z.enum(["hoje", "semana"]) }),
  executar: async ({ periodo }) => `<dado rotulo="prazos">${periodo}: contestação 05/11</dado>`,
};

describe("cliente falso: conversar", () => {
  it("executa as ferramentas do roteiro de verdade e devolve histórico append-only", async () => {
    const cliente = criarClienteIaFalso({}, { assistente: [{ ferramenta: "listar_prazos", entrada: { periodo: "semana" } }, { texto: "Você tem 1 prazo na semana: contestação em 05/11." }] });
    const deltas: string[] = [];
    const fases: string[] = [];
    const r = await cliente.conversar({
      agente: "assistente",
      modelo: "claude-sonnet-5-5",
      sistema: "x",
      mensagens: [{ role: "user", content: "quais meus prazos da semana?" }],
      ferramentas: [listarPrazos as unknown as FerramentaIa],
      aoTexto: (d) => deltas.push(d),
      aoFerramenta: (nome, fase) => fases.push(`${nome}:${fase}`),
    });
    expect(r.texto).toContain("contestação");
    expect(r.chamadas).toEqual([expect.objectContaining({ nome: "listar_prazos", entrada: { periodo: "semana" } })]);
    expect(r.chamadas[0].saida).toContain("05/11");
    expect(r.novasMensagens.map((m) => m.role)).toEqual(["assistant", "user", "assistant"]);
    expect(deltas.join("")).toBe(r.texto);
    expect(fases).toEqual(["listar_prazos:inicio", "listar_prazos:fim"]);
    expect(cliente.conversasFeitas).toHaveLength(1);
    expect(r.uso.cacheRead).toBeGreaterThan(0);
  });

  it("rejeita entrada de ferramenta fora do schema e ferramenta desconhecida", async () => {
    const cliente = criarClienteIaFalso({}, { assistente: [{ ferramenta: "listar_prazos", entrada: { periodo: "ontem" } }] });
    await expect(cliente.conversar({ agente: "assistente", modelo: "m", sistema: "x", mensagens: [], ferramentas: [listarPrazos as unknown as FerramentaIa] })).rejects.toBeInstanceOf(ErroIa);
    const outro = criarClienteIaFalso({}, { assistente: [{ ferramenta: "apagar_tudo", entrada: {} }] });
    await expect(outro.conversar({ agente: "assistente", modelo: "m", sistema: "x", mensagens: [], ferramentas: [] })).rejects.toThrow(/não está disponível/);
  });

  it("erro dentro da ferramenta vira resultado de ferramenta, não exceção", async () => {
    const quebrada: FerramentaIa = { nome: "quebrada", descricao: "falha", schema: z.object({}), executar: async () => { throw new Error("banco fora"); } };
    const cliente = criarClienteIaFalso({}, { assistente: [{ ferramenta: "quebrada", entrada: {} }, { texto: "Não consegui consultar agora." }] });
    const r = await cliente.conversar({ agente: "assistente", modelo: "m", sistema: "x", mensagens: [], ferramentas: [quebrada] });
    expect(r.chamadas[0].erro).toBe("banco fora");
    const resultado = r.novasMensagens[1];
    expect(resultado.role).toBe("user");
    expect(JSON.stringify(resultado.content)).toContain("Erro ao executar a ferramenta quebrada");
  });

  it("sem roteiro para o agente, falha com mensagem clara", async () => {
    const cliente = criarClienteIaFalso({});
    await expect(cliente.conversar({ agente: "revisor", modelo: "m", sistema: "x", mensagens: [], ferramentas: [] })).rejects.toThrow(/Sem roteiro falso/);
  });
});

describe("textoDaMensagem", () => {
  it("junta só os blocos de texto", () => {
    expect(textoDaMensagem([{ type: "text", text: "a", citations: null }, { type: "tool_use", id: "1", name: "x", input: {} }, { type: "text", text: "b", citations: null }])).toBe("a\nb");
    expect(textoDaMensagem("puro")).toBe("puro");
  });
});

describe("lacunas", () => {
  it("conta e lista o marcador único, com e sem motivo", () => {
    const t = "Valor da causa: [[VERIFICAR: calcular pelo art. 292]]. Comarca de [[VERIFICAR]] e data [[ verificar : data do fato ]].";
    expect(contarLacunas(t)).toBe(3);
    expect(listarLacunas(t).map((l) => l.motivo)).toEqual(["calcular pelo art. 292", "", "data do fato"]);
    expect(contarLacunas("sem lacuna")).toBe(0);
  });

  it("normaliza as marcas antigas das skills", () => {
    const n = normalizarLacunas("A (verificar) B [VERIFICAR] C [__________] D [[NOME DO CLIENTE]] E [[VERIFICAR: ok]]");
    expect(contarLacunas(n)).toBe(5);
    expect(n).toContain("[[VERIFICAR: nome do cliente]]");
    expect(n).toContain("[[VERIFICAR: ok]]");
  });
});

describe("registro de agentes", () => {
  it("todo agente tem versão, modelo por env e limite de saída; produção marcada", () => {
    for (const [nome, d] of Object.entries(AGENTES)) {
      expect(d.versao, nome).toMatch(/\.v\d+$/);
      expect(d.modeloEnv).toMatch(/^IA_MODELO_/);
      expect(d.maxTokens).toBeGreaterThan(0);
    }
    expect(definicaoAgente("peticao").producao).toBe(true);
    expect(definicaoAgente("classificador_publicacao").producao).toBe(false);
    expect(definicaoAgente("revisor").modeloEnv).toBe("IA_MODELO_PECAS_FORTE");
  });
});
