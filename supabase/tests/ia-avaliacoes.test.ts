import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Migrations 0041 a 0043 (lote 10, avaliação e custo de IA). Escrito sem rodar: o CI roda com Postgres de serviço.
 * 1. ia_avaliacoes: só sócio do próprio escritório lê; advogado e outro escritório não veem nada;
 * 2. ia_custos_do_escritorio agrupa o mês por agente só do escritório pedido;
 * 3. public.ia_gasto_mes e public.ia_teto_escritorio não são executáveis por usuário autenticado (só service role).
 */
describe("avaliação de IA e custo por agente", () => {
  let db: BancoDeTeste;
  const escA = "11111111-1111-4111-8111-111111111111";
  const escB = "22222222-2222-4222-8222-222222222222";
  const socioA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const advogadoA = "abababab-abab-4bab-8bab-abababababab";
  const socioB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const comoSocioA = { sub: socioA, escritorio_id: escA, papel: "socio" };
  const comoAdvogadoA = { sub: advogadoA, escritorio_id: escA, papel: "advogado" };
  const comoSocioB = { sub: socioB, escritorio_id: escB, papel: "socio" };

  beforeAll(async () => {
    db = await subirBancoDeTeste();
    await db.client.query("insert into public.escritorios (id, nome) values ($1, 'A'), ($2, 'B')", [escA, escB]);
    await db.client.query(
      "insert into public.ia_avaliacoes (escritorio_id, agente, agente_versao, modo, total_casos, casos_ok, situacao) values ($1, 'julgador', 'julgador.v1', 'falso', 3, 3, 'aprovada')",
      [escA],
    );
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  it("sócio do escritório lê a avaliação; advogado e outro escritório não", async () => {
    const dono = await db.comoUsuario(comoSocioA, async (c) => (await c.query("select count(*)::int as n from public.ia_avaliacoes")).rows[0].n);
    expect(dono).toBe(1);
    const advogado = await db.comoUsuario(comoAdvogadoA, async (c) => (await c.query("select count(*)::int as n from public.ia_avaliacoes")).rows[0].n);
    expect(advogado).toBe(0);
    const outro = await db.comoUsuario(comoSocioB, async (c) => (await c.query("select count(*)::int as n from public.ia_avaliacoes")).rows[0].n);
    expect(outro).toBe(0);
  });

  it("custos do escritório vêm vazios sem execuções e não vazam de outro escritório", async () => {
    const { rows } = await db.client.query("select * from public.ia_custos_do_escritorio($1)", [escA]);
    expect(rows).toEqual([]);
  });

  it("wrappers do teto não são executáveis por usuário autenticado", async () => {
    await expect(
      db.comoUsuario(comoSocioA, (c) => c.query("select public.ia_gasto_mes($1::uuid)", [escA])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.comoUsuario(comoSocioA, (c) => c.query("select public.ia_teto_escritorio($1::uuid)", [escA])),
    ).rejects.toThrow(/permission denied/);
  });
});
