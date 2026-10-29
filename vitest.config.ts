import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/mocks/server-only.ts") },
  },
  test: {
    include: ["src/**/*.test.ts", "supabase/tests/**/*.test.ts", "scripts/**/*.test.ts", "tests/avaliacao/**/*.test.ts"],
    exclude: ["node_modules", ".next", "tests/e2e/**"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 180_000,
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts", "src/lib/**/mocks/**", "src/lib/supabase/database.types.ts"],
      reporter: ["text", "lcov"],
      thresholds: {
        // O motor de prazos é o coração do MVP: nada entra sem cobertura total.
        "src/lib/prazos/**/*.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
        // Honorários: piso, teto do art. 50 e bloqueio por tabela vencida protegem a advogada; nada entra sem cobertura total.
        "src/lib/honorarios/calculo.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
        // Cálculos de atualização: índice errado ou faltando vira valor errado em petição; nada entra sem cobertura total.
        "src/lib/calculos/**/*.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
        // Relatórios: taxa de cumprimento, médias e CSV (com proteção contra fórmula); módulo pequeno e totalmente coberto.
        "src/lib/relatorios/**/*.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
