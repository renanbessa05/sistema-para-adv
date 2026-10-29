import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Migration 0036 (jurisprudência, lote 7):
 * 1. usuário autenticado lê a base de referência, mas não grava nela (escrita só pela service role);
 * 2. a busca por texto acha o precedente pelo tema e não acha tema alheio;
 * 3. sem pgvector no banco, a busca híbrida não existe e a busca por texto segue funcionando.
 */
describe("jurisprudência", () => {
  let db: BancoDeTeste;
  const escA = "11111111-1111-4111-8111-111111111111";
  const advogadoA = "abababab-abab-4bab-8bab-abababababab";
  const comoAdvogadoA = { sub: advogadoA, escritorio_id: escA, papel: "advogado" };
  const ementa = "A pretensão de simples reexame de prova não enseja recurso especial.";

  beforeAll(async () => {
    db = await subirBancoDeTeste();
    const c = db.client;
    await c.query("insert into auth.users (id, email) values ($1, 'adv.a@t.local')", [advogadoA]);
    await c.query("insert into public.escritorios (id, nome) values ($1, 'A')", [escA]);
    const r = await c.query(
      "insert into ref.jurisprudencia (tribunal, tipo, referencia_citacao, ementa) values ('STJ', 'sumula', 'Súmula 7/STJ', $1) returning id",
      [ementa],
    );
    await c.query("insert into ref.jurisprudencia_chunks (jurisprudencia_id, ordem, texto) values ($1, 1, $2)", [r.rows[0].id, ementa]);
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  it("usuário autenticado lê a base, mas não grava nela", async () => {
    const lidos = await db.comoUsuario(comoAdvogadoA, (cl) => cl.query("select referencia_citacao from ref.jurisprudencia"));
    expect(lidos.rows.map((r) => r.referencia_citacao)).toEqual(["Súmula 7/STJ"]);
    await expect(
      db.comoUsuario(comoAdvogadoA, (cl) => cl.query("insert into ref.jurisprudencia (tribunal, tipo, referencia_citacao, ementa) values ('STJ', 'acordao', 'X', 'ementa suficiente para o teste')")),
    ).rejects.toThrow(/permission denied/);
  });

  it("busca por texto acha o precedente pelo tema e não acha tema alheio", async () => {
    const acha = await db.comoUsuario(comoAdvogadoA, (cl) => cl.query("select referencia from public.buscar_jurisprudencia_texto($1, 5)", ["reexame de prova"]));
    expect(acha.rows.map((r) => r.referencia)).toEqual(["Súmula 7/STJ"]);
    const nao = await db.comoUsuario(comoAdvogadoA, (cl) => cl.query("select referencia from public.buscar_jurisprudencia_texto($1, 5)", ["contrato de locação residencial"]));
    expect(nao.rows).toEqual([]);
  });

  it("sem pgvector, a busca híbrida não existe", async () => {
    const ext = await db.client.query("select exists (select 1 from pg_extension where extname = 'vector') as tem");
    if (ext.rows[0].tem) return;
    const fn = await db.client.query("select to_regprocedure('public.buscar_jurisprudencia(text,text,integer)') is not null as existe");
    expect(fn.rows[0].existe).toBe(false);
  });
});
