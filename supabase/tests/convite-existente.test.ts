import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Migration 0020 (vincular_membro_existente): convite para e-mail que já tem usuário no Auth.
 * 1. a trigger de 0004 não dispara (não há INSERT em auth.users), então a RPC faz o vínculo pela service role;
 * 2. devolve o usuario_id vinculado; null quando não há usuário ou não há convite pendente; idempotente;
 * 3. authenticated (mesmo sócio) não executa a função.
 */
describe("convite para usuário já existente", () => {
  let db: BancoDeTeste;
  const escritorioA = "11111111-1111-4111-8111-111111111111";
  const escritorioB = "22222222-2222-4222-8222-222222222222";
  const socioA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const existente = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

  /** Simula uma requisição com a chave service_role (equipe.ts usa o cliente admin). */
  const comoServiceRole = async <T>(fn: (c: Client) => Promise<T>): Promise<T> => {
    const c = db.client;
    await c.query("begin");
    try {
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
      await c.query("set local role service_role");
      const r = await fn(c);
      await c.query("commit");
      return r;
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  };

  beforeAll(async () => {
    db = await subirBancoDeTeste();
    const c = db.client;
    await c.query("insert into auth.users (id, email) values ($1, 'socio.a@teste.local'), ($2, 'Existente@Teste.local')", [socioA, existente]);
    await c.query("insert into public.escritorios (id, nome) values ($1, 'Escritório A'), ($2, 'Escritório B')", [escritorioA, escritorioB]);
    await c.query(
      `insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, oab_numero, oab_uf)
       values ($1, $2, 'socio.a@teste.local', 'socio', 'Sócia A', '20817', 'MT')`,
      [escritorioA, socioA],
    );
    // Convite pendente (usuario_id nulo) gravado pelo sócio antes de inviteUserByEmail falhar por usuário existente
    await c.query(
      `insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, convite_token)
       values ($1, null, 'existente@teste.local', 'advogado', 'Advogado Existente', 'tok-existente')`,
      [escritorioA],
    );
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  it("service role vincula o convite pendente ao usuário já existente (e-mail sem caixa, com espaços)", async () => {
    const antes = await db.client.query("select usuario_id, aceito_em from public.escritorio_membros where email_convite = 'existente@teste.local'");
    expect(antes.rows[0].usuario_id).toBeNull();
    expect(antes.rows[0].aceito_em).toBeNull();

    const vinculado = await comoServiceRole(async (c) => (await c.query("select public.vincular_membro_existente($1) as id", ["  EXISTENTE@teste.local "])).rows[0].id);
    expect(vinculado).toBe(existente);

    const depois = await db.client.query("select usuario_id, aceito_em, convite_token from public.escritorio_membros where email_convite = 'existente@teste.local'");
    expect(depois.rows[0].usuario_id).toBe(existente);
    expect(depois.rows[0].aceito_em).not.toBeNull();
    expect(depois.rows[0].convite_token).toBeNull();

    // O hook de token passa a devolver o escritório no próximo login/refresh
    const evento = { user_id: existente, claims: { sub: existente, role: "authenticated" } };
    const hook = await db.client.query("select public.custom_access_token_hook($1::jsonb) as r", [JSON.stringify(evento)]);
    expect(hook.rows[0].r.claims.escritorio_id).toBe(escritorioA);
    expect(hook.rows[0].r.claims.papel).toBe("advogado");
  });

  it("devolve null quando não há convite pendente (idempotente), o e-mail não tem usuário ou está vazio", async () => {
    const repetido = await comoServiceRole(async (c) => (await c.query("select public.vincular_membro_existente('existente@teste.local') as id")).rows[0].id);
    expect(repetido).toBeNull();
    const semUsuario = await comoServiceRole(async (c) => (await c.query("select public.vincular_membro_existente('ninguem@teste.local') as id")).rows[0].id);
    expect(semUsuario).toBeNull();
    const vazio = await comoServiceRole(async (c) => (await c.query("select public.vincular_membro_existente('  ') as id")).rows[0].id);
    expect(vazio).toBeNull();
    // A linha já vinculada segue igual
    const linha = await db.client.query("select usuario_id from public.escritorio_membros where email_convite = 'existente@teste.local'");
    expect(linha.rows[0].usuario_id).toBe(existente);
  });

  it("vincula também o convite pendente de outro escritório para o mesmo e-mail", async () => {
    await db.client.query("insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo) values ($1, null, 'existente@teste.local', 'administrativo', 'Existente em B')", [escritorioB]);
    const vinculado = await comoServiceRole(async (c) => (await c.query("select public.vincular_membro_existente('existente@teste.local') as id")).rows[0].id);
    expect(vinculado).toBe(existente);
    const linhas = await db.client.query("select escritorio_id, usuario_id from public.escritorio_membros where email_convite = 'existente@teste.local' order by escritorio_id");
    expect(linhas.rows).toEqual([
      { escritorio_id: escritorioA, usuario_id: existente },
      { escritorio_id: escritorioB, usuario_id: existente },
    ]);
  });

  it("authenticated não executa a função, nem como sócio", async () => {
    await db.client.query("insert into auth.users (id, email) values ('f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0', 'outro.pendente@teste.local')");
    await db.client.query("insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo) values ($1, null, 'outro.pendente@teste.local', 'estagiario', 'Pendente')", [escritorioA]);
    await expect(db.comoUsuario({ sub: socioA, escritorio_id: escritorioA, papel: "socio" }, (c) => c.query("select public.vincular_membro_existente('outro.pendente@teste.local')"))).rejects.toThrow(/permission denied/i);
    const linha = await db.client.query("select usuario_id from public.escritorio_membros where email_convite = 'outro.pendente@teste.local'");
    expect(linha.rows[0].usuario_id).toBeNull();
  });
});
