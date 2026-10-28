import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

/**
 * Cria um banco temporário num Postgres real (DATABASE_URL_TESTE, superusuário), aplica o shim do
 * Supabase e todas as migrations em ordem. Usado pelos testes de banco (CI com serviço postgres:16
 * e local com o Postgres do sistema). Em produção as migrations vão pela CLI do Supabase.
 *
 * Padrão local: postgres://adv_teste:adv_teste@127.0.0.1:5432/postgres
 */
export interface BancoDeTeste {
  client: Client;
  nomeBanco: string;
  parar: () => Promise<void>;
  /** Executa um bloco como usuário autenticado com os claims dados (simula o JWT do Supabase). */
  comoUsuario: <T>(claims: Record<string, unknown>, fn: (c: Client) => Promise<T>) => Promise<T>;
}

const raiz = path.resolve(__dirname, "../..");

export function urlDeTeste(): string {
  return process.env.DATABASE_URL_TESTE ?? "postgres://adv_teste:adv_teste@127.0.0.1:5432/postgres";
}

export function listarMigrations(): string[] {
  const dir = path.join(raiz, "supabase", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(dir, f));
}

export async function aplicarMigrations(client: Client, { comShim = true } = {}): Promise<string[]> {
  if (comShim) await client.query(readFileSync(path.join(raiz, "supabase", "tests", "shim-supabase.sql"), "utf8"));
  const aplicadas: string[] = [];
  for (const arquivo of listarMigrations()) {
    const sql = readFileSync(arquivo, "utf8");
    try {
      await client.query(sql);
      aplicadas.push(path.basename(arquivo));
    } catch (e) {
      throw new Error(`Falha na migration ${path.basename(arquivo)}: ${(e as Error).message}`);
    }
  }
  return aplicadas;
}

export async function subirBancoDeTeste(): Promise<BancoDeTeste> {
  const urlBase = new URL(urlDeTeste());
  const nomeBanco = `adv_teste_${randomBytes(4).toString("hex")}`;

  const admin = new Client({ connectionString: urlBase.toString() });
  await admin.connect();
  await admin.query(`create database ${nomeBanco}`);
  await admin.end();

  const urlBanco = new URL(urlBase.toString());
  urlBanco.pathname = `/${nomeBanco}`;
  const client = new Client({ connectionString: urlBanco.toString() });
  await client.connect();
  try {
    await aplicarMigrations(client);
  } catch (e) {
    // Não deixa banco órfão quando uma migration falha.
    await client.end().catch(() => undefined);
    const limpeza = new Client({ connectionString: urlBase.toString() });
    await limpeza.connect();
    await limpeza.query(`drop database if exists ${nomeBanco} with (force)`).catch(() => undefined);
    await limpeza.end();
    throw e;
  }

  const parar = async () => {
    try {
      await client.end();
    } finally {
      const limpeza = new Client({ connectionString: urlBase.toString() });
      await limpeza.connect();
      await limpeza.query(`drop database if exists ${nomeBanco} with (force)`);
      await limpeza.end();
    }
  };

  const comoUsuario = async <T>(claims: Record<string, unknown>, fn: (c: Client) => Promise<T>): Promise<T> => {
    await client.query("begin");
    try {
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", ...claims })]);
      await client.query("set local role authenticated");
      const r = await fn(client);
      await client.query("commit");
      return r;
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  };

  return { client, nomeBanco, parar, comoUsuario };
}
