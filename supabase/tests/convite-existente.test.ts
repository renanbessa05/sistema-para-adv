import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Migrations 0020 + 0022: convite para e-mail que já tem usuário no Auth.
 * 1. a trigger de 0004 não dispara (não há INSERT em auth.users); a RPC vincular_membro_existente(e-mail, escritório),
 *    só pela service role, liga usuario_id à linha pendente DAQUELE escritório e deixa aceito_em nulo;
 * 2. enquanto não aceito, o vínculo não define os claims do JWT (hook) nem o escritório do WhatsApp;
 * 3. a própria pessoa vê o convite em convites_pendentes() e aceita com aceitar_convite(escritório);
 * 4. authenticated (mesmo sócio) não executa a RPC de vínculo; ninguém aceita convite de outro.
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

  const hookPara = async (usuario: string) => {
    const evento = { user_id: usuario, claims: { sub: usuario, role: "authenticated" } };
    const { rows } = await db.client.query("select public.custom_access_token_hook($1::jsonb) as r", [JSON.stringify(evento)]);
    return rows[0].r.claims as { escritorio_id?: string; papel?: string };
  };

  beforeAll(async () => {
    db = await subirBancoDeTeste();
    const c = db.client;
    await c.query("insert into auth.users (id, email) values ($1, 'socio.a@teste.local'), ($2, 'Existente@Teste.local')", [socioA, existente]);
    await c.query("insert into public.escritorios (id, nome) values ($1, 'Escritório A'), ($2, 'Escritório B')", [escritorioA, escritorioB]);
    await c.query(
      `insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, oab_numero, oab_uf, aceito_em)
       values ($1, $2, 'socio.a@teste.local', 'socio', 'Sócia A', '20817', 'MT', now())`,
      [escritorioA, socioA],
    );
    // A pessoa já é membro aceito de B; A convida o mesmo e-mail (linha pendente gravada pelo sócio de A)
    await c.query(
      `insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, aceito_em)
       values ($1, $2, 'existente@teste.local', 'administrativo', 'Existente em B', now() - interval '30 days')`,
      [escritorioB, existente],
    );
    await c.query(
      `insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, convite_token)
       values ($1, null, 'existente@teste.local', 'advogado', 'Advogado Existente', 'tok-existente')`,
      [escritorioA],
    );
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  it("service role liga o usuário à linha pendente do escritório informado, sem aceitar por ele", async () => {
    const vinculado = await comoServiceRole(async (c) => (await c.query("select public.vincular_membro_existente($1, $2) as id", ["  EXISTENTE@teste.local ", escritorioA])).rows[0].id);
    expect(vinculado).toBe(existente);

    const linha = await db.client.query("select usuario_id, aceito_em, convite_token from public.escritorio_membros where email_convite = 'existente@teste.local' and escritorio_id = $1", [escritorioA]);
    expect(linha.rows[0].usuario_id).toBe(existente);
    expect(linha.rows[0].aceito_em).toBeNull();
    expect(linha.rows[0].convite_token).not.toBeNull();

    // Sem aceite, o escritório da sessão continua sendo B (o vínculo aceito), e o WhatsApp também
    const claims = await hookPara(existente);
    expect(claims.escritorio_id).toBe(escritorioB);
    expect(claims.papel).toBe("administrativo");
  });

  it("devolve null sem convite pendente no escritório (idempotente), sem usuário, ou com e-mail/escritório vazios", async () => {
    const repetido = await comoServiceRole(async (c) => (await c.query("select public.vincular_membro_existente('existente@teste.local', $1) as id", [escritorioA])).rows[0].id);
    expect(repetido).toBeNull();
    const outroEscritorio = await comoServiceRole(async (c) => (await c.query("select public.vincular_membro_existente('existente@teste.local', $1) as id", [escritorioB])).rows[0].id);
    expect(outroEscritorio).toBeNull();
    const semUsuario = await comoServiceRole(async (c) => (await c.query("select public.vincular_membro_existente('ninguem@teste.local', $1) as id", [escritorioA])).rows[0].id);
    expect(semUsuario).toBeNull();
    const vazio = await comoServiceRole(async (c) => (await c.query("select public.vincular_membro_existente('  ', $1) as id", [escritorioA])).rows[0].id);
    expect(vazio).toBeNull();
    const semEscritorio = await comoServiceRole(async (c) => (await c.query("select public.vincular_membro_existente('existente@teste.local', null) as id")).rows[0].id);
    expect(semEscritorio).toBeNull();
  });

  it("a própria pessoa vê o convite pendente e aceita; só então o escritório muda nos claims", async () => {
    // Logada sem claims de escritório (ou com os de B): convites_pendentes só devolve os dela
    const pendentes = await db.comoUsuario({ sub: existente, escritorio_id: escritorioB, papel: "administrativo" }, async (c) => (await c.query("select escritorio_id, escritorio_nome, papel::text from public.convites_pendentes()")).rows);
    expect(pendentes).toEqual([{ escritorio_id: escritorioA, escritorio_nome: "Escritório A", papel: "advogado" }]);

    // Outra pessoa não aceita por ela
    const alheio = await db.comoUsuario({ sub: socioA, escritorio_id: escritorioA, papel: "socio" }, async (c) => (await c.query("select public.aceitar_convite($1) as ok", [escritorioA])).rows[0].ok);
    expect(alheio).toBe(false);

    const aceito = await db.comoUsuario({ sub: existente, escritorio_id: escritorioB, papel: "administrativo" }, async (c) => (await c.query("select public.aceitar_convite($1) as ok", [escritorioA])).rows[0].ok);
    expect(aceito).toBe(true);
    const linha = await db.client.query("select aceito_em, convite_token from public.escritorio_membros where email_convite = 'existente@teste.local' and escritorio_id = $1", [escritorioA]);
    expect(linha.rows[0].aceito_em).not.toBeNull();
    expect(linha.rows[0].convite_token).toBeNull();

    const claims = await hookPara(existente);
    expect(claims.escritorio_id).toBe(escritorioA);
    expect(claims.papel).toBe("advogado");

    const deNovo = await db.comoUsuario({ sub: existente, escritorio_id: escritorioA, papel: "advogado" }, async (c) => (await c.query("select public.aceitar_convite($1) as ok", [escritorioA])).rows[0].ok);
    expect(deNovo).toBe(false);
  });

  it("authenticated não executa a RPC de vínculo, nem como sócio", async () => {
    await db.client.query("insert into auth.users (id, email) values ('f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0', 'outro.pendente@teste.local')");
    await db.client.query("insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo) values ($1, null, 'outro.pendente@teste.local', 'estagiario', 'Pendente')", [escritorioA]);
    await expect(db.comoUsuario({ sub: socioA, escritorio_id: escritorioA, papel: "socio" }, (c) => c.query("select public.vincular_membro_existente('outro.pendente@teste.local', $1)", [escritorioA]))).rejects.toThrow(/permission denied/i);
    const linha = await db.client.query("select usuario_id from public.escritorio_membros where email_convite = 'outro.pendente@teste.local'");
    expect(linha.rows[0].usuario_id).toBeNull();
  });
});
