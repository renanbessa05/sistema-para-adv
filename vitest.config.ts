import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts", "supabase/tests/**/*.test.ts", "scripts/**/*.test.ts"],
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
      },
    },
  },
});
