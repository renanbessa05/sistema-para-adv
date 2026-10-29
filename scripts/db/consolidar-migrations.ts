/**
 * Junta todas as migrations, em ordem, num único arquivo SQL para colar no SQL Editor do Supabase
 * (caminho sem CLI e sem acesso de rede ao banco a partir do ambiente de desenvolvimento).
 *
 *   pnpm db:consolidar                 # escreve supabase/consolidado.sql (ignorado pelo git)
 *   pnpm db:consolidar caminho.sql     # escreve no caminho indicado
 *
 * Reexecutar o arquivo no mesmo banco é seguro: as migrations usam if not exists / create or replace.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { listarMigrations } from "../../supabase/tests/harness";

const destino = process.argv[2] ?? path.resolve(__dirname, "../../supabase/consolidado.sql");
const partes = [
  `-- Assistente Jurídica: todas as migrations em ordem (gerado em ${new Date().toISOString().slice(0, 16)}Z por pnpm db:consolidar).`,
  "-- Cole inteiro no SQL Editor do projeto Supabase e execute uma única vez. Reexecutar é seguro.",
];
for (const arquivo of listarMigrations()) {
  partes.push("", `-- ===== ${path.basename(arquivo)} =====`, readFileSync(arquivo, "utf8"));
}
writeFileSync(destino, partes.join("\n"));
console.log(`${listarMigrations().length} migrations consolidadas em ${destino}`);
