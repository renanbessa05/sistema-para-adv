import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { montarCnj } from "../../src/lib/cnj/numero-cnj";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Migrations 0037 e 0038 (audiências, lote 8):
 * 1. audiência de processo sigiloso some para quem não pode ver o processo;
 * 2. outro escritório não vê nenhuma audiência;
 * 3. o evento audiencia_d1 existe no enum de notificações.
 */
describe("audiências", () => {
  let db: BancoDeTeste;
  const escA = "11111111-1111-4111-8111-111111111111";
  const escB = "22222222-2222-4222-8222-222222222222";
  const socioA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const estagiarioA = "acacacac-acac-4cac-8cac-acacacacacac";
  const socioB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const comoSocioA = { sub: socioA, escritorio_id: escA, papel: "socio" };
  const comoEstagiarioA = { sub: estagiarioA, escritorio_id: escA, papel: "estagiario" };
  const comoSocioB = { sub: socioB, escritorio_id: escB, papel: "socio" };
  let audienciaSigilosa: string;

  beforeAll(async () => {
    db = await subirBancoDeTeste();
    const c = db.client;
    for (const [id, email] of [
      [socioA, "socio.a@t.local"],
      [estagiarioA, "est.a@t.local"],
      [socioB, "socio.b@t.local"],
    ]) {
      await c.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
    }
    await c.query("insert into public.escritorios (id, nome) values ($1, 'A'), ($2, 'B')", [escA, escB]);
    await c.query(
      `insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, aceito_em)
       values ($1, $2, 'socio.a@t.local', 'socio', 'Sócia A', now()), ($1, $3, 'est.a@t.local', 'estagiario', 'Est A', now()), ($4, $5, 'socio.b@t.local', 'socio', 'Sócio B', now())`,
      [escA, socioA, estagiarioA, escB, socioB],
    );
    const procs = await c.query(
      "insert into public.processos (escritorio_id, numero_cnj, responsavel_id, segredo_justica) values ($1, $2, $3, false), ($1, $4, $3, true) returning id, segredo_justica",
      [escA, montarCnj(1, 2025, 8, "11", "0041"), socioA, montarCnj(2, 2025, 8, "11", "0041")],
    );
    const processoSigiloso = procs.rows.find((r) => r.segredo_justica)!.id as string;
    const processoAberto = procs.rows.find((r) => !r.segredo_justica)!.id as string;
    await c.query("insert into public.audiencias (escritorio_id, processo_id, tipo, data_hora) values ($1, $2, 'instrucao', now() + interval '7 days')", [escA, processoAberto]);
    const sigilosa = await c.query("insert into public.audiencias (escritorio_id, processo_id, tipo, data_hora) values ($1, $2, 'julgamento', now() + interval '8 days') returning id", [escA, processoSigiloso]);
    audienciaSigilosa = sigilosa.rows[0].id as string;
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  it("audiência de processo sigiloso some para quem não pode ver o processo", async () => {
    const estagiario = await db.comoUsuario(comoEstagiarioA, (cl) => cl.query("select id from public.audiencias where id = $1", [audienciaSigilosa]));
    expect(estagiario.rowCount).toBe(0);
    const socio = await db.comoUsuario(comoSocioA, (cl) => cl.query("select id from public.audiencias where id = $1", [audienciaSigilosa]));
    expect(socio.rowCount).toBe(1);
  });

  it("outro escritório não vê nenhuma audiência", async () => {
    const outro = await db.comoUsuario(comoSocioB, (cl) => cl.query("select id from public.audiencias"));
    expect(outro.rowCount).toBe(0);
  });

  it("o evento de alerta de véspera existe no enum de notificações", async () => {
    const r = await db.client.query("select 'audiencia_d1'::public.evento_notificacao as evento");
    expect(r.rows[0].evento).toBe("audiencia_d1");
  });
});
