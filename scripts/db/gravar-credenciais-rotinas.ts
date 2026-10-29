/**
 * Grava (ou atualiza) no Vault do projeto Supabase vinculado as credenciais que o agendador do banco usa
 * para chamar as rotinas do app: 'app:url' e 'app:cron_secret' (migration 0023).
 *
 * Uso: APP_URL=https://<app>.vercel.app CRON_SECRET=<mesmo da Vercel> pnpm tsx scripts/db/gravar-credenciais-rotinas.ts
 * (ou com as duas variáveis em .env.local). Precisa de `supabase link` feito. Os valores nunca são impressos.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function lerEnvLocal(): Record<string, string> {
  const arquivo = path.resolve(".env.local");
  if (!existsSync(arquivo)) return {};
  const vars: Record<string, string> = {};
  for (const linha of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Z_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
  }
  return vars;
}

const env = { ...lerEnvLocal(), ...process.env };
const url = (env.APP_URL ?? "").trim();
const segredo = (env.CRON_SECRET ?? "").trim();
if (!/^https?:\/\//.test(url) || segredo.length < 16) {
  console.error("Defina APP_URL (https://...) e CRON_SECRET (16+ caracteres) no ambiente ou em .env.local.");
  process.exit(1);
}

const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;
const sql = `
do $$
declare v_id uuid;
begin
  for v_id in select id from vault.secrets where name in ('app:url', 'app:cron_secret') loop
    delete from vault.secrets where id = v_id;
  end loop;
  perform vault.create_secret(${literal(url)}, 'app:url', 'URL do app para as rotinas agendadas (migration 0023)');
  perform vault.create_secret(${literal(segredo)}, 'app:cron_secret', 'CRON_SECRET das rotas /api/jobs (migration 0023)');
end
$$;
select name, created_at from vault.secrets where name in ('app:url', 'app:cron_secret') order by name;
`;

const dir = mkdtempSync(path.join(tmpdir(), "rotinas-"));
const arquivo = path.join(dir, "credenciais.sql");
try {
  writeFileSync(arquivo, sql, { mode: 0o600 });
  const saida = execFileSync("supabase", ["db", "query", "--linked", "-o", "json", "-f", arquivo], { encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "pipe"] });
  // JSON (-o json) ou, se a CLI insistir na tabela, as linhas "│ app:... │"
  const nomes = [...saida.matchAll(/"name":s*"(app:[a-z_]+)"|│s*(app:[a-z_]+)s*│/g)].map((m) => m[1] ?? m[2]);
  console.log(nomes.length === 2 ? `Credenciais gravadas no Vault: ${nomes.join(", ")}` : `Resposta inesperada da CLI:\n${saida.slice(0, 500)}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
