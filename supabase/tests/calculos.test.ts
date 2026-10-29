import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { montarCnj } from "../../src/lib/cnj/numero-cnj";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Migrations 0034 e 0035 (cálculos de atualização, lote 6):
 * 1. só advogado ou sócio envia cálculo para aprovação; cálculo sem resultado não segue;
 * 2. status só muda pela RPC (update direto em 'aprovado' é recusado);
 * 3. cálculo de processo sigiloso invisível para quem não pode ver; outro escritório não vê nada;
 * 4. decisão aprovada leva o cálculo a 'aprovado'; rejeitada o devolve a 'rejeitado' com a aprovação desligada.
 */
describe("cálculos de atualização", () => {
  let db: BancoDeTeste;
  const escA = "11111111-1111-4111-8111-111111111111";
  const escB = "22222222-2222-4222-8222-222222222222";
  const socioA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const advogadoA = "abababab-abab-4bab-8bab-abababababab";
  const estagiarioA = "acacacac-acac-4cac-8cac-acacacacacac";
  const socioB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const comoSocioA = { sub: socioA, escritorio_id: escA, papel: "socio" };
  const comoAdvogadoA = { sub: advogadoA, escritorio_id: escA, papel: "advogado" };
  const comoEstagiarioA = { sub: estagiarioA, escritorio_id: escA, papel: "estagiario" };
  const comoSocioB = { sub: socioB, escritorio_id: escB, papel: "socio" };
  const resultado = { totais: { valorOriginal: 100, valorCorrigido: 102, juros: 1, total: 103 }, dataFinal: "2026-01-31" };
  let processoSigiloso: string;
  let calculoAberto: string;
  let calculoSigiloso: string;
  let calculoSemResultado: string;

  const criarCalculo = (usuario: typeof comoAdvogadoA, processo: string | null, res: unknown) =>
    db.comoUsuario(usuario, async (c) => {
      const r = await c.query(
        "insert into public.calculos (escritorio_id, processo_id, regra_codigo, titulo, resultado, criado_por) values ($1, $2, 'civel_pre_14905', 'Cálculo de teste', $3, $4) returning id",
        [usuario.escritorio_id, processo, res === null ? null : JSON.stringify(res), usuario.sub],
      );
      return r.rows[0].id as string;
    });

  beforeAll(async () => {
    db = await subirBancoDeTeste();
    const c = db.client;
    for (const [id, email] of [
      [socioA, "socio.a@t.local"],
      [advogadoA, "adv.a@t.local"],
      [estagiarioA, "est.a@t.local"],
      [socioB, "socio.b@t.local"],
    ]) {
      await c.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
    }
    await c.query("insert into public.escritorios (id, nome) values ($1, 'A'), ($2, 'B')", [escA, escB]);
    await c.query(
      `insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, aceito_em)
       values ($1, $2, 'socio.a@t.local', 'socio', 'Sócia A', now()), ($1, $3, 'adv.a@t.local', 'advogado', 'Adv A', now()),
              ($1, $4, 'est.a@t.local', 'estagiario', 'Est A', now()), ($5, $6, 'socio.b@t.local', 'socio', 'Sócio B', now())`,
      [escA, socioA, advogadoA, estagiarioA, escB, socioB],
    );
    const procs = await c.query(
      "insert into public.processos (escritorio_id, numero_cnj, responsavel_id, segredo_justica) values ($1, $2, $3, false), ($1, $4, $3, true) returning id, segredo_justica",
      [escA, montarCnj(1, 2025, 8, "11", "0041"), advogadoA, montarCnj(2, 2025, 8, "11", "0041")],
    );
    processoSigiloso = procs.rows.find((r) => r.segredo_justica)!.id as string;
    const processoAberto = procs.rows.find((r) => !r.segredo_justica)!.id as string;
    calculoAberto = await criarCalculo(comoAdvogadoA, processoAberto, resultado);
    calculoSigiloso = await criarCalculo(comoSocioA, processoSigiloso, resultado);
    calculoSemResultado = await criarCalculo(comoAdvogadoA, null, null);
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  it("só advogado ou sócio envia para aprovação; sem resultado não segue", async () => {
    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.calculo_enviar_aprovacao($1)", [calculoAberto]))).rejects.toThrow(/advogado ou sócio/);
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.calculo_enviar_aprovacao($1)", [calculoSemResultado]))).rejects.toThrow(/Calcule antes/);
  });

  it("envio cria a aprovação e muda o status; o status não muda por update direto", async () => {
    const aprovacao = await db.comoUsuario(comoAdvogadoA, async (c) => (await c.query("select public.calculo_enviar_aprovacao($1) as id", [calculoAberto])).rows[0].id as string);
    expect(aprovacao).toMatch(/^[0-9a-f-]{36}$/);
    expect((await db.client.query("select status, aprovacao_id from public.calculos where id = $1", [calculoAberto])).rows[0]).toEqual({ status: "aguardando_aprovacao", aprovacao_id: aprovacao });
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("update public.calculos set status = 'aprovado' where id = $1", [calculoAberto]))).rejects.toThrow();
  });

  it("cálculo de processo sigiloso some para quem não pode ver; outro escritório não vê nada", async () => {
    const estagiario = await db.comoUsuario(comoEstagiarioA, (c) => c.query("select id from public.calculos where id = $1", [calculoSigiloso]));
    expect(estagiario.rowCount).toBe(0);
    const socio = await db.comoUsuario(comoSocioA, (c) => c.query("select id from public.calculos where id = $1", [calculoSigiloso]));
    expect(socio.rowCount).toBe(1);
    const outroEscritorio = await db.comoUsuario(comoSocioB, (c) => c.query("select id from public.calculos"));
    expect(outroEscritorio.rowCount).toBe(0);
  });

  it("aprovada leva a 'aprovado'; rejeitada devolve a 'rejeitado' e desliga a aprovação", async () => {
    const aprovacaoAprovada = (await db.client.query("select aprovacao_id from public.calculos where id = $1", [calculoAberto])).rows[0].aprovacao_id as string;
    await db.comoUsuario(comoSocioA, (c) => c.query("select public.decidir_aprovacao($1, 'aprovada', 'confere', null, null)", [aprovacaoAprovada]));
    expect((await db.client.query("select status from public.calculos where id = $1", [calculoAberto])).rows[0].status).toBe("aprovado");

    const aprovacaoRejeitada = await db.comoUsuario(comoAdvogadoA, async (c) => (await c.query("select public.calculo_enviar_aprovacao($1) as id", [calculoSigiloso])).rows[0].id as string);
    await db.comoUsuario(comoSocioA, (c) => c.query("select public.decidir_aprovacao($1, 'rejeitada', 'refazer juros', null, null)", [aprovacaoRejeitada]));
    expect((await db.client.query("select status, aprovacao_id from public.calculos where id = $1", [calculoSigiloso])).rows[0]).toEqual({ status: "rejeitado", aprovacao_id: null });
  });
});
