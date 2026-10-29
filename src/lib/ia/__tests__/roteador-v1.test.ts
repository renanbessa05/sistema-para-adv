import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { criarClienteIa, criarClienteIaFalso } from "../cliente";
import { rotearMensagem } from "../roteador-intents";
import { AGENTES_ABRIVEIS, INTENTS, INTENTS_WHATSAPP } from "../schemas/intents";
import { SISTEMA as SISTEMA_V1, VERSAO as VERSAO_V1 } from "../prompts/roteador-intents.v1";

interface Caso {
  id: string;
  texto: string;
  esperado: string;
  alternativas?: string[];
  agente?: string;
}
const fixture = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../tests/fixtures/frases-painel.json"), "utf8")) as { meta_acerto: number; casos: Caso[] };

describe("roteador v1 (painel)", () => {
  it("a fixture só usa intents e agentes conhecidos", () => {
    for (const c of fixture.casos) {
      expect(INTENTS, c.id).toContain(c.esperado);
      for (const a of c.alternativas ?? []) expect(INTENTS, c.id).toContain(a);
      if (c.agente) expect(AGENTES_ABRIVEIS, c.id).toContain(c.agente);
    }
    expect(INTENTS_WHATSAPP.every((i) => INTENTS.includes(i))).toBe(true);
    expect(INTENTS_WHATSAPP).not.toContain("pergunta_livre");
  });

  it("usa o prompt v1 e o rótulo do painel quando canal = painel; v0 no WhatsApp", async () => {
    const resposta = { intent: "pergunta_livre", confianca: 0.9, entidades: { processo: null, pessoa: null, tarefa: null, periodo: null, data: null, agente: null }, resposta_curta: null };
    const cliente = criarClienteIaFalso({ roteador_intents: resposta });
    const r = await rotearMensagem("quem é o responsável pelo 1002345?", { cliente, modelo: "claude-haiku-5-5", canal: "painel" });
    expect(r.agenteVersao).toBe(VERSAO_V1);
    expect(r.ehEscrita).toBe(false);
    expect(cliente.chamadas[0].sistema).toBe(SISTEMA_V1);
    expect(cliente.chamadas[0].usuario).toContain('<dado rotulo="mensagem_painel">');
    const w = await rotearMensagem("quem é o responsável pelo 1002345?", { cliente, modelo: "claude-haiku-5-5" });
    expect(w.agenteVersao).toBe("roteador-intents.v0");
    expect(cliente.chamadas[1].usuario).toContain('<dado rotulo="mensagem_whatsapp">');
  });

  it("regras rápidas valem nos dois canais sem chamar o modelo", async () => {
    const cliente = criarClienteIaFalso({});
    const r = await rotearMensagem("bom dia", { cliente, modelo: "m", canal: "painel" });
    expect(r.modelo).toBe("regra");
    expect(r.dados.intent).toBe("resumo_do_dia");
    expect(r.dados.entidades.agente).toBeNull();
    expect(cliente.chamadas).toHaveLength(0);
  });

  it.skipIf(!process.env.IA_TESTE_REAL || !process.env.ANTHROPIC_API_KEY)("contra a API real, acerta a meta da fixture", async () => {
    const cliente = criarClienteIa({ apiKey: process.env.ANTHROPIC_API_KEY as string });
    let acertos = 0;
    const erros: string[] = [];
    for (const c of fixture.casos) {
      const r = await rotearMensagem(c.texto, { cliente, modelo: process.env.IA_MODELO_TRIAGEM ?? "claude-haiku-5-5", canal: "painel", nomesDaEquipe: ["Bruna Costa Abdo", "Bruno Silva"] });
      const ok = r.dados.intent === c.esperado || (c.alternativas ?? []).includes(r.dados.intent);
      const agenteOk = !c.agente || r.dados.entidades.agente === c.agente;
      if (ok && agenteOk) acertos += 1;
      else erros.push(`${c.id}: esperado ${c.esperado}${c.agente ? `/${c.agente}` : ""}, veio ${r.dados.intent}/${r.dados.entidades.agente}`);
    }
    const taxa = acertos / fixture.casos.length;
    expect(taxa, erros.join("\n")).toBeGreaterThanOrEqual(fixture.meta_acerto);
  }, 180_000);
});
