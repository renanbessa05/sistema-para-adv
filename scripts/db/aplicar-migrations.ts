/**
 * Aplica as migrations num banco Postgres indicado por DATABASE_URL (uso: ambientes sem a CLI do Supabase,
 * ou conferência local num Postgres embutido com --embutido).
 *
 *   DATABASE_URL=postgres://... pnpm db:migrar
 *   pnpm db:migrar --embutido      # sobe um Postgres temporário, aplica tudo e desliga (smoke test)
 */
import { Client } from "pg";
import { aplicarMigrations, subirBancoDeTeste } from "../../supabase/tests/harness";

async function principal() {
  const embutido = process.argv.includes("--embutido");
  if (embutido) {
    const db = await subirBancoDeTeste();
    const { rows } = await db.client.query("select count(*)::int as n from ref.feriados");
    console.log(`Migrations aplicadas num Postgres embutido. ref.feriados: ${rows[0].n} linhas.`);
    await db.parar();
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Defina DATABASE_URL ou use --embutido");
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const aplicadas = await aplicarMigrations(client, { comShim: false });
    console.log(`Aplicadas ${aplicadas.length} migrations:\n- ${aplicadas.join("\n- ")}`);
  } finally {
    await client.end();
  }
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
