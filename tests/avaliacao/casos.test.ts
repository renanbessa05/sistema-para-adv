import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ArquivoCasosSchema } from "../../src/lib/ia/avaliacao/casos";
import { AGENTES_AVALIAVEIS, SCHEMAS_AVALIACAO } from "../../src/lib/ia/avaliacao/agentes";
import { avaliarCaso, resumirAvaliacao } from "../../src/lib/ia/avaliacao/avaliar";

/**
 * Avaliação em modo falso (sem API, roda no CI): cada caso de tests/avaliacao/<agente>/casos.json é avaliado com a
 * saída falsa do próprio arquivo. Prova que as rubricas e os casos estão coerentes; não mede o modelo.
 * Para medir o modelo: scripts/avaliar-agente.ts --agente <nome> --real (manual, com IA_TESTE_REAL=1).
 */
describe("avaliação de agentes (modo falso)", () => {
  for (const agente of Object.keys(AGENTES_AVALIAVEIS)) {
    describe(agente, () => {
      const arquivo = path.resolve("tests/avaliacao", agente, "casos.json");
      const dados = ArquivoCasosSchema.parse(JSON.parse(readFileSync(arquivo, "utf8")));

      it("o arquivo declara o mesmo agente da pasta e tem ids únicos", () => {
        expect(dados.agente).toBe(agente);
        expect(new Set(dados.casos.map((c) => c.id)).size).toBe(dados.casos.length);
      });

      it("tem ao menos um caso de controle negativo (esperado reprovado)", () => {
        expect(dados.casos.some((c) => c.esperado === "reprovado")).toBe(true);
      });

      it("todos os casos batem com o esperado", () => {
        const resultados = dados.casos.map((caso) =>
          avaliarCaso(caso, caso.saidaFalsa, {
            schemas: SCHEMAS_AVALIACAO,
            veredictos: caso.juizFalso ?? {},
          }),
        );
        const falhas = resultados.filter((r) => !r.ok).map((r) => ({ id: r.id, rubricas: r.rubricas.filter((x) => !x.ok) }));
        expect(falhas).toEqual([]);
        expect(resumirAvaliacao(resultados).situacao).toBe("aprovada");
      });
    });
  }
});
