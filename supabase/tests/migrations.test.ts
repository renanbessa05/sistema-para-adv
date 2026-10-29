import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { montarCnj } from "../../src/lib/cnj/numero-cnj";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Prova, num Postgres embutido:
 * 1. as migrations aplicam em ordem, do zero;
 * 2. a validação de CNJ do banco bate com a do TypeScript;
 * 3. o hook de token grava escritorio_id e papel nos claims;
 * 4. nenhuma linha atravessa escritórios (RLS);
 * 5. estagiário não cria processo; só advogado/sócio marca sigilo.
 */
describe("migrations e RLS", () => {
  let db: BancoDeTeste;
  const escritorioA = "11111111-1111-4111-8111-111111111111";
  const escritorioB = "22222222-2222-4222-8222-222222222222";
  const socioA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const advogadoA = "abababab-abab-4bab-8bab-abababababab";
  const estagiarioA = "acacacac-acac-4cac-8cac-acacacacacac";
  const socioB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  beforeAll(async () => {
    db = await subirBancoDeTeste();
    const c = db.client;
    for (const [id, email] of [
      [socioA, "socio.a@teste.local"],
      [advogadoA, "adv.a@teste.local"],
      [estagiarioA, "est.a@teste.local"],
      [socioB, "socio.b@teste.local"],
    ]) {
      await c.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
    }
    await c.query("insert into public.escritorios (id, nome) values ($1, 'Escritório A'), ($2, 'Escritório B')", [escritorioA, escritorioB]);
    await c.query(
      `insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, oab_numero, oab_uf, aceito_em)
       values ($1, $2, 'socio.a@teste.local', 'socio', 'Sócia A', '20817', 'MT', now()),
              ($1, $3, 'adv.a@teste.local', 'advogado', 'Advogado A', '30000', 'MT', now()),
              ($1, $4, 'est.a@teste.local', 'estagiario', 'Estagiário A', null, null, now()),
              ($5, $6, 'socio.b@teste.local', 'socio', 'Sócio B', '40000', 'MT', now())`,
      [escritorioA, socioA, advogadoA, estagiarioA, escritorioB, socioB],
    );
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  it("aplica todas as migrations e carrega dados de referência", async () => {
    const { rows } = await db.client.query("select sigla, codigo_cnj from ref.tribunais");
    expect(rows).toEqual([{ sigla: "TJMT", codigo_cnj: "8.11" }]);
    const comarcas = await db.client.query("select count(*)::int as n from ref.comarcas");
    expect(comarcas.rows[0].n).toBeGreaterThan(30);
    const feriados = await db.client.query("select count(*)::int as n from ref.feriados where data between '2026-01-01' and '2026-12-31'");
    expect(feriados.rows[0].n).toBeGreaterThanOrEqual(17);
  });

  it("valida o número CNJ no banco como no TypeScript", async () => {
    const valido = montarCnj(1002345, 2025, 8, "11", "0041");
    const invalido = valido.slice(0, 7) + (valido.slice(7, 9) === "11" ? "12" : "11") + valido.slice(9);
    const { rows } = await db.client.query("select app.cnj_valido($1) as a, app.cnj_valido($2) as b, app.cnj_mascara($1) as m", [valido, invalido]);
    expect(rows[0].a).toBe(true);
    expect(rows[0].b).toBe(false);
    expect(rows[0].m).toMatch(/^\d{7}-\d{2}\.2025\.8\.11\.0041$/);
  });

  it("o hook de token grava escritorio_id e papel nos claims", async () => {
    const evento = { user_id: advogadoA, claims: { sub: advogadoA, role: "authenticated", app_metadata: { provider: "email" } } };
    const { rows } = await db.client.query("select public.custom_access_token_hook($1::jsonb) as r", [JSON.stringify(evento)]);
    const claims = rows[0].r.claims;
    expect(claims.escritorio_id).toBe(escritorioA);
    expect(claims.papel).toBe("advogado");
    expect(claims.app_metadata.escritorio_id).toBe(escritorioA);
    expect(claims.app_metadata.provider).toBe("email");
    const semVinculo = await db.client.query("select public.custom_access_token_hook($1::jsonb) as r", [JSON.stringify({ user_id: "00000000-0000-4000-8000-000000000000", claims: { sub: "x" } })]);
    expect(semVinculo.rows[0].r.claims.escritorio_id).toBeUndefined();
  });

  it("ao criar o usuário no Auth, o convite pendente é vinculado pelo e-mail", async () => {
    await db.client.query("insert into public.escritorio_membros (escritorio_id, email_convite, papel, nome_completo, convite_token) values ($1, 'novo@teste.local', 'administrativo', 'Novo', 'tok')", [escritorioA]);
    const novoId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await db.client.query("insert into auth.users (id, email) values ($1, 'Novo@Teste.local')", [novoId]);
    const { rows } = await db.client.query("select usuario_id, convite_token, aceito_em from public.escritorio_membros where email_convite = 'novo@teste.local'");
    expect(rows[0].usuario_id).toBe(novoId);
    expect(rows[0].convite_token).toBeNull();
    expect(rows[0].aceito_em).not.toBeNull();
  });

  it("isola escritórios: usuário de A não vê nada de B", async () => {
    const numeroA = montarCnj(1, 2025, 8, "11", "0041");
    const numeroB = montarCnj(2, 2025, 8, "11", "0041");
    await db.client.query("insert into public.processos (escritorio_id, numero_cnj, responsavel_id) values ($1, $2, $3), ($4, $5, $6)", [escritorioA, numeroA, advogadoA, escritorioB, numeroB, socioB]);

    const vistosPorA = await db.comoUsuario({ sub: socioA, escritorio_id: escritorioA, papel: "socio" }, async (c) => {
      const p = await c.query("select numero_cnj from public.processos order by numero_cnj");
      const e = await c.query("select id from public.escritorios");
      const m = await c.query("select count(*)::int as n from public.escritorio_membros");
      return { processos: p.rows.map((r) => r.numero_cnj), escritorios: e.rows.map((r) => r.id), membros: m.rows[0].n };
    });
    expect(vistosPorA.processos).toEqual([numeroA]);
    expect(vistosPorA.escritorios).toEqual([escritorioA]);
    expect(vistosPorA.membros).toBe(4);

    const vistosPorB = await db.comoUsuario({ sub: socioB, escritorio_id: escritorioB, papel: "socio" }, async (c) => {
      const p = await c.query("select numero_cnj from public.processos");
      return p.rows.map((r) => r.numero_cnj);
    });
    expect(vistosPorB).toEqual([numeroB]);

    // Inserir com escritorio_id de outro tenant é recusado
    await expect(
      db.comoUsuario({ sub: socioA, escritorio_id: escritorioA, papel: "socio" }, (c) =>
        c.query("insert into public.processos (escritorio_id, numero_cnj) values ($1, $2)", [escritorioB, montarCnj(3, 2025, 8, "11", "0041")]),
      ),
    ).rejects.toThrow(/row-level security/);

    // Sem claim de escritório, nada aparece
    const anonimo = await db.comoUsuario({ sub: socioA }, async (c) => (await c.query("select count(*)::int as n from public.processos")).rows[0].n);
    expect(anonimo).toBe(0);
  });

  it("estagiário não cria processo; advogado cria; sigilo só por advogado ou sócio", async () => {
    const numero = montarCnj(10, 2025, 8, "11", "0041");
    await expect(
      db.comoUsuario({ sub: estagiarioA, escritorio_id: escritorioA, papel: "estagiario" }, (c) =>
        c.query("insert into public.processos (escritorio_id, numero_cnj) values ($1, $2)", [escritorioA, numero]),
      ),
    ).rejects.toThrow(/row-level security/);

    const id = await db.comoUsuario({ sub: advogadoA, escritorio_id: escritorioA, papel: "advogado" }, async (c) => {
      const r = await c.query("insert into public.processos (escritorio_id, numero_cnj, responsavel_id) values ($1, $2, $3) returning id", [escritorioA, numero, advogadoA]);
      return r.rows[0].id as string;
    });

    await expect(
      db.comoUsuario({ sub: estagiarioA, escritorio_id: escritorioA, papel: "estagiario" }, (c) => c.query("select public.marcar_sigilo($1, true, 1)", [id])),
    ).rejects.toThrow(/Apenas advogado ou sócio/);

    await db.comoUsuario({ sub: advogadoA, escritorio_id: escritorioA, papel: "advogado" }, (c) => c.query("select public.marcar_sigilo($1, true, 1)", [id]));
    const { rows } = await db.client.query("select segredo_justica, nivel_sigilo from public.processos where id = $1", [id]);
    expect(rows[0]).toEqual({ segredo_justica: true, nivel_sigilo: 1 });

    // Sócio de outro escritório não alcança o processo
    await expect(
      db.comoUsuario({ sub: socioB, escritorio_id: escritorioB, papel: "socio" }, (c) => c.query("select public.marcar_sigilo($1, false)", [id])),
    ).rejects.toThrow(/não encontrado/);
  });

  it("rejeita número CNJ inválido no processo", async () => {
    await expect(db.client.query("insert into public.processos (escritorio_id, numero_cnj) values ($1, '12345678901234567890')", [escritorioA])).rejects.toThrow(/check constraint/);
  });
});
