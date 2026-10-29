import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Migrations 0024 e 0026 (efeitos de aprovação; gasto e teto de IA):
 * 1. decidir_aprovacao chama app.efeito_aprovacao_<tipo> quando existe e grava efeito_aplicado_em;
 * 2. sem função para o tipo, a decisão é gravada normalmente;
 * 3. exceção no efeito desfaz a decisão (mesma transação);
 * 4. criar_aprovacao recusa duplicata pendente e exige escritório;
 * 5. app.ia_gasto_mes soma só o mês e o escritório; ia_teto_escritorio lê a configuração.
 */
describe("efeitos de aprovação e teto de IA", () => {
  let db: BancoDeTeste;
  const escritorioA = "11111111-1111-4111-8111-111111111111";
  const escritorioB = "22222222-2222-4222-8222-222222222222";
  const socioA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const socioB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const comoSocioA = { sub: socioA, escritorio_id: escritorioA, papel: "socio" };
  const objeto = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  beforeAll(async () => {
    db = await subirBancoDeTeste();
    const c = db.client;
    await c.query("insert into auth.users (id, email) values ($1, 'socio.a@teste.local'), ($2, 'socio.b@teste.local')", [socioA, socioB]);
    await c.query("insert into public.escritorios (id, nome) values ($1, 'A'), ($2, 'B')", [escritorioA, escritorioB]);
    await c.query(
      `insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, aceito_em)
       values ($1, $2, 'socio.a@teste.local', 'socio', 'Sócia A', now()), ($3, $4, 'socio.b@teste.local', 'socio', 'Sócio B', now())`,
      [escritorioA, socioA, escritorioB, socioB],
    );
    // Efeito de teste para o tipo 'contrato': grava o id numa tabela de rastro; falha quando o comentário for 'explode'
    await c.query(`
      create table public.rastro_efeitos (aprovacao_id uuid, status text);
      create or replace function app.efeito_aprovacao_contrato(a public.aprovacoes) returns void language plpgsql security definer set search_path = '' as $$
      begin
        if a.comentario = 'explode' then raise exception 'efeito falhou de propósito'; end if;
        insert into public.rastro_efeitos (aprovacao_id, status) values (a.id, a.status::text);
      end $$;
    `);
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  const criar = (tipo: string, id: string) =>
    db.comoUsuario(comoSocioA, async (c) => (await c.query("select public.criar_aprovacao($1::public.aprovacao_objeto, $2::uuid, '{\"x\":1}'::jsonb) as id", [tipo, id])).rows[0].id as string);

  it("aplica o efeito do tipo e marca efeito_aplicado_em", async () => {
    const id = await criar("contrato", objeto);
    const decidida = await db.comoUsuario(comoSocioA, async (c) => (await c.query("select * from public.decidir_aprovacao($1, 'aprovada', 'ok')", [id])).rows[0]);
    expect(decidida.status).toBe("aprovada");
    expect(decidida.efeito_aplicado_em).not.toBeNull();
    const rastro = await db.client.query("select status from public.rastro_efeitos where aprovacao_id = $1", [id]);
    expect(rastro.rows).toEqual([{ status: "aprovada" }]);
  });

  it("sem função para o tipo, decide sem efeito", async () => {
    const id = await criar("minuta", "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    const decidida = await db.comoUsuario(comoSocioA, async (c) => (await c.query("select * from public.decidir_aprovacao($1, 'rejeitada', 'não')", [id])).rows[0]);
    expect(decidida.status).toBe("rejeitada");
    expect(decidida.efeito_aplicado_em).toBeNull();
  });

  it("exceção no efeito desfaz a decisão", async () => {
    const id = await criar("contrato", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
    await expect(db.comoUsuario(comoSocioA, (c) => c.query("select * from public.decidir_aprovacao($1, 'aprovada', 'explode')", [id]))).rejects.toThrow(/efeito falhou/);
    const status = await db.client.query("select status from public.aprovacoes where id = $1", [id]);
    expect(status.rows[0].status).toBe("pendente");
  });

  it("criar_aprovacao recusa duplicata pendente", async () => {
    const outro = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    await criar("calculo", outro);
    await expect(criar("calculo", outro)).rejects.toThrow(/pendente/);
  });

  it("soma o gasto do mês por escritório e lê o teto configurado", async () => {
    await db.client.query(
      `insert into public.ia_execucoes (escritorio_id, agente, modelo, input_tokens, output_tokens, custo_estimado, criado_em)
       values ($1, 'x', 'claude-haiku-5-5', 10, 10, 1.25, now()), ($1, 'x', 'claude-haiku-5-5', 10, 10, 0.75, now()),
              ($1, 'x', 'claude-haiku-5-5', 10, 10, 9.00, now() - interval '40 days'), ($2, 'x', 'claude-haiku-5-5', 10, 10, 5.00, now())`,
      [escritorioA, escritorioB],
    );
    const gasto = await db.client.query("select app.ia_gasto_mes($1) as g", [escritorioA]);
    expect(Number(gasto.rows[0].g)).toBeCloseTo(2.0, 5);
    const semTeto = await db.client.query("select app.ia_teto_escritorio($1) as t", [escritorioA]);
    expect(semTeto.rows[0].t).toBeNull();
    await db.client.query("insert into public.escritorio_configuracoes (escritorio_id, chave, valor) values ($1, 'ia.teto_mensal_usd', '12.5'::jsonb)", [escritorioA]);
    const comTeto = await db.client.query("select app.ia_teto_escritorio($1) as t", [escritorioA]);
    expect(Number(comTeto.rows[0].t)).toBe(12.5);
  });
});
