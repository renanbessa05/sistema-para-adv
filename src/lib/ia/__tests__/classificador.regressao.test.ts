import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classificarPublicacao } from "../classificador-publicacao";
import { criarClienteIa, criarClienteIaFalso } from "../cliente";

/**
 * Regressão do classificador contra a fixture rotulada pela advogada.
 * Por padrão usa um cliente falso que devolve o esperado (valida só o formato da fixture e o pipeline).
 * Com IA_TESTE_REAL=1 e ANTHROPIC_API_KEY, chama o modelo de verdade e exige a meta de acerto.
 */
const fixture = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../tests/fixtures/publicacoes-rotuladas.json"), "utf8")) as {
  meta_acerto: number;
  casos: { id: string; texto: string; esperado: { tipo: string; gera_prazo: boolean; dias_sugeridos: number | null } }[];
};

describe("classificador: fixture rotulada", () => {
  it("fixture tem formato válido", () => {
    expect(fixture.casos.length).toBeGreaterThan(0);
    for (const c of fixture.casos) {
      expect(c.id).toBeTruthy();
      expect(c.texto.length).toBeGreaterThan(20);
      expect(typeof c.esperado.gera_prazo).toBe("boolean");
    }
  });

  const real = process.env.IA_TESTE_REAL === "1" && process.env.ANTHROPIC_API_KEY;
  it.runIf(!real)("pipeline com cliente falso devolve o esperado", async () => {
    for (const c of fixture.casos) {
      const cliente = criarClienteIaFalso({
        classificador_publicacao: { tipo: c.esperado.tipo, gera_prazo: c.esperado.gera_prazo, ato: c.esperado.gera_prazo ? "ato" : null, dias_sugeridos: c.esperado.dias_sugeridos, contagem: c.esperado.gera_prazo ? "dias_uteis" : null, dobro: false, numero_cnj: null, partes: [], advogados_destinatarios: [], sugere_sigilo: false, resumo_simples: "resumo", confianca: 0.9, observacoes: null },
      });
      const r = await classificarPublicacao({ texto: c.texto }, { cliente, modelo: "falso" });
      expect(r.dados.tipo).toBe(c.esperado.tipo);
      expect(r.dados.gera_prazo).toBe(c.esperado.gera_prazo);
    }
  });

  it.runIf(Boolean(real))("modelo real atinge a meta de acerto", async () => {
    const cliente = criarClienteIa({ apiKey: process.env.ANTHROPIC_API_KEY! });
    let tipoCerto = 0;
    let prazoCerto = 0;
    for (const c of fixture.casos) {
      const r = await classificarPublicacao({ texto: c.texto }, { cliente, modelo: process.env.IA_MODELO_TRIAGEM ?? "claude-haiku-5-5" });
      if (r.dados.tipo === c.esperado.tipo) tipoCerto += 1;
      if (r.dados.gera_prazo === c.esperado.gera_prazo) prazoCerto += 1;
    }
    const n = fixture.casos.length;
    console.log(`tipo: ${tipoCerto}/${n}; gera_prazo: ${prazoCerto}/${n}`);
    expect(tipoCerto / n).toBeGreaterThanOrEqual(fixture.meta_acerto);
    expect(prazoCerto / n).toBeGreaterThanOrEqual(fixture.meta_acerto);
  }, 300_000);
});
