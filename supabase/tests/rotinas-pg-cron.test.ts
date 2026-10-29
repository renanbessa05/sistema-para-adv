import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Migration 0023: agendador no Postgres. No CI (Postgres sem pg_cron/pg_net) prova que:
 * 1. as funções existem e não são executáveis por usuários da API;
 * 2. sem credenciais no Vault a chamada é pulada (null), não um erro;
 * 3. com credenciais mas sem pg_net também pula; nome de rotina inválido é recusado;
 * 4. a visão de agendamentos devolve vazio sem pg_cron em vez de falhar.
 */
describe("rotinas agendadas pelo Postgres", () => {
  let db: BancoDeTeste;

  beforeAll(async () => {
    db = await subirBancoDeTeste();
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  it("sem credenciais no Vault, pula a rotina sem erro", async () => {
    const { rows } = await db.client.query("select app.chamar_rotina('captar-djen') as id");
    expect(rows[0].id).toBeNull();
  });

  it("com credenciais mas sem pg_net, pula; rotina inválida é recusada", async () => {
    await db.client.query("select vault.create_secret('https://app.exemplo.adv.br', 'app:url')");
    await db.client.query("select vault.create_secret('segredo-de-teste', 'app:cron_secret')");
    const { rows } = await db.client.query("select app.credencial_rotinas('app:url') as url, app.chamar_rotina('captar-djen') as id");
    expect(rows[0].url).toBe("https://app.exemplo.adv.br");
    expect(rows[0].id).toBeNull();
    await expect(db.client.query("select app.chamar_rotina('../etc')")).rejects.toThrow(/inválido/);
  });

  it("visão de agendamentos não falha sem pg_cron", async () => {
    const { rows } = await db.client.query("select * from app.rotinas_agendadas()");
    expect(rows).toEqual([]);
  });

  it("usuário autenticado não executa as funções de rotina", async () => {
    await expect(
      db.comoUsuario({ sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "authenticated" }, (c) => c.query("select app.chamar_rotina('captar-djen')")),
    ).rejects.toThrow(/permission denied/);
  });
});
