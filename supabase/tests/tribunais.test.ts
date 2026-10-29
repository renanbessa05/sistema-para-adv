import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Migrations 0039 e 0040 (camada local dos demais TJs, lote 9):
 * 1. o seed traz os itens-base de todos os TJs ('*') como a verificar, sem nenhuma confirmação pronta;
 * 2. confirmação do escritório só aparece para o próprio escritório;
 * 3. o tipo de análise outros_tribunais existe no enum.
 */
describe("camada local dos tribunais", () => {
  let db: BancoDeTeste;
  const escA = "11111111-1111-4111-8111-111111111111";
  const escB = "22222222-2222-4222-8222-222222222222";
  const socioA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const socioB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const comoSocioA = { sub: socioA, escritorio_id: escA, papel: "socio" };
  const comoSocioB = { sub: socioB, escritorio_id: escB, papel: "socio" };

  beforeAll(async () => {
    db = await subirBancoDeTeste();
    const c = db.client;
    await c.query("insert into auth.users (id, email) values ($1, 'socio.a@t.local'), ($2, 'socio.b@t.local')", [socioA, socioB]);
    await c.query("insert into public.escritorios (id, nome) values ($1, 'A'), ($2, 'B')", [escA, escB]);
    await c.query(
      `insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, aceito_em)
       values ($1, $2, 'socio.a@t.local', 'socio', 'Sócia A', now()), ($3, $4, 'socio.b@t.local', 'socio', 'Sócio B', now())`,
      [escA, socioA, escB, socioB],
    );
    await db.comoUsuario(comoSocioA, (cl) =>
      cl.query("insert into public.escritorio_camada_local (escritorio_id, tribunal_sigla, bloco, item, fonte) values ($1, 'TJSP', 1, 'Sistema eletrônico usado no grau de origem', 'Página oficial do TJSP')", [escA]),
    );
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  it("o seed traz só itens a verificar, para todos os TJs", async () => {
    const r = await db.client.query("select count(*)::int as total, count(*) filter (where situacao = 'a_verificar')::int as pendentes from ref.tribunal_camada_local where tribunal_sigla = '*'");
    expect(r.rows[0].total).toBeGreaterThanOrEqual(30);
    expect(r.rows[0].pendentes).toBe(r.rows[0].total);
  });

  it("confirmação do escritório A não aparece para o escritório B", async () => {
    const mine = await db.comoUsuario(comoSocioA, (cl) => cl.query("select id from public.escritorio_camada_local"));
    expect(mine.rowCount).toBe(1);
    const outro = await db.comoUsuario(comoSocioB, (cl) => cl.query("select id from public.escritorio_camada_local"));
    expect(outro.rowCount).toBe(0);
  });

  it("o tipo de análise outros_tribunais existe no enum", async () => {
    const r = await db.client.query("select 'outros_tribunais'::public.analise_tipo as tipo");
    expect(r.rows[0].tipo).toBe("outros_tribunais");
  });
});
