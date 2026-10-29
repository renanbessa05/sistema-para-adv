import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Migrations 0028 a 0030 (tabela OAB/MT, contratos, parcelas):
 * 1. a tabela vigente vem do seed (URH 1.339,07, vigência 12/03/2026) e é legível por authenticated;
 * 2. estagiário cria rascunho mas não confirma; advogado confirma valor e modalidade;
 * 3. enviar para aprovação exige documentos; aprovação aplica o efeito (aprovado / rascunho);
 * 4. assinatura gera as parcelas; parcela só do escritório; estagiário não marca parcela;
 * 5. nada atravessa escritórios.
 */
describe("contratos e honorários", () => {
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
  let clienteA: string;
  let contrato: string;

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
    const cl = await c.query("insert into public.clientes (escritorio_id, nome, cpf_cnpj) values ($1, 'Marina Silva', '00000000191') returning id", [escA]);
    clienteA = cl.rows[0].id as string;
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  it("tabela OAB/MT vigente vem do seed e é legível", async () => {
    const r = await db.comoUsuario(comoAdvogadoA, async (c) => {
      const id = (await c.query("select app.tabela_honorarios_vigente('MT', '2026-10-29') as id")).rows[0].id as string;
      const t = (await c.query("select valor_urh, vigencia_inicio::text as v from ref.tabelas_honorarios where id = $1", [id])).rows[0];
      const n = (await c.query("select count(*)::int as n from ref.tabela_honorarios_itens where tabela_id = $1", [id])).rows[0].n;
      const ord = (await c.query("select percentual, minimo_urh from ref.tabela_honorarios_itens where tabela_id = $1 and codigo = 'IX.ordinario'", [id])).rows[0];
      return { t, n, ord };
    });
    expect(Number(r.t.valor_urh)).toBe(1339.07);
    expect(r.t.v).toBe("2026-03-12");
    expect(r.n).toBeGreaterThan(100);
    expect(Number(r.ord.percentual)).toBe(20);
    expect(Number(r.ord.minimo_urh)).toBe(8);
    const antes = await db.client.query("select app.tabela_honorarios_vigente('MT', '2020-01-01') as id");
    expect(antes.rows[0].id).toBeNull();
  });

  it("estagiário cria rascunho mas não confirma; advogado confirma valor e modalidade", async () => {
    contrato = await db.comoUsuario(comoEstagiarioA, async (c) => (await c.query("insert into public.contratos (escritorio_id, cliente_id, polo, relato, criado_por) values ($1, $2, 'autor', 'relato', $3) returning id", [escA, clienteA, estagiarioA])).rows[0].id as string);
    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.contrato_confirmar_valor($1, 'fixo', 10712.56)", [contrato]))).rejects.toThrow(/advogado ou sócio/);
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.contrato_confirmar_valor($1, 'exito', null, null)", [contrato]))).rejects.toThrow(/percentual/);
    const r = await db.comoUsuario(comoAdvogadoA, async (c) => (await c.query("select status::text as status, modalidade::text as modalidade, valor_fixo, parcelas from public.contrato_confirmar_valor($1, 'fixo_parcelado', 10712.56, null, 4, '2026-11-10', 10)", [contrato])).rows[0]);
    expect(r).toEqual({ status: "confirmado", modalidade: "fixo_parcelado", valor_fixo: "10712.56", parcelas: 4 });
    // status não muda por UPDATE direto para um valor fora de rascunho/aguardando_confirmacao
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("update public.contratos set status = 'aprovado' where id = $1", [contrato]))).rejects.toThrow(/row-level security/);
  });

  it("aprovação exige documentos; efeito muda o status; rejeição volta a rascunho", async () => {
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.contrato_enviar_aprovacao($1)", [contrato]))).rejects.toThrow(/Gere o contrato/);
    const docs = await db.client.query(
      `insert into public.documentos (escritorio_id, cliente_id, tipo, nome, caminho, mime, tamanho, hash_sha256, origem)
       values ($1, $2, 'contrato', 'c.docx', $1 || '/x/1.docx', 'application/x', 10, 'h1', 'gerado'), ($1, $2, 'procuracao', 'p.docx', $1 || '/x/2.docx', 'application/x', 10, 'h2', 'gerado') returning id`,
      [escA, clienteA],
    );
    await db.client.query("update public.contratos set documento_contrato_id = $2, documento_procuracao_id = $3 where id = $1", [contrato, docs.rows[0].id, docs.rows[1].id]);
    const aprovacao = await db.comoUsuario(comoAdvogadoA, async (c) => (await c.query("select public.contrato_enviar_aprovacao($1) as id", [contrato])).rows[0].id as string);
    expect((await db.client.query("select status from public.contratos where id = $1", [contrato])).rows[0].status).toBe("aguardando_aprovacao");
    await db.comoUsuario(comoSocioA, (c) => c.query("select public.decidir_aprovacao($1, 'rejeitada', 'refazer')", [aprovacao]));
    expect((await db.client.query("select status, aprovacao_id from public.contratos where id = $1", [contrato])).rows[0]).toEqual({ status: "rascunho", aprovacao_id: null });
    // de novo: confirma, envia, aprova
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.contrato_confirmar_valor($1, 'fixo_parcelado', 10712.56, null, 4, '2026-11-10', 10)", [contrato]));
    const ap2 = await db.comoUsuario(comoAdvogadoA, async (c) => (await c.query("select public.contrato_enviar_aprovacao($1) as id", [contrato])).rows[0].id as string);
    await db.comoUsuario(comoSocioA, (c) => c.query("select public.decidir_aprovacao($1, 'aprovada', 'ok')", [ap2]));
    expect((await db.client.query("select status from public.contratos where id = $1", [contrato])).rows[0].status).toBe("aprovado");
  });

  it("assinatura gera 4 parcelas no dia 10; estagiário não marca; parcela invisível para outro escritório", async () => {
    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.contrato_registrar_assinatura($1, '2026-11-01')", [contrato]))).rejects.toThrow(/advogado ou sócio/);
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.contrato_registrar_assinatura($1, '2026-11-01')", [contrato]));
    const parcelas = await db.comoUsuario(comoAdvogadoA, async (c) => (await c.query("select numero, vencimento::text as v, valor from public.contrato_parcelas where contrato_id = $1 order by numero", [contrato])).rows);
    expect(parcelas.map((p) => p.v)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10", "2027-02-10"]);
    expect(parcelas.every((p) => Number(p.valor) === 2678.14)).toBe(true);
    const primeira = parcelas[0] as { numero: number };
    const id = (await db.client.query("select id from public.contrato_parcelas where contrato_id = $1 and numero = $2", [contrato, primeira.numero])).rows[0].id as string;
    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.contrato_parcela_marcar($1, 'paga')", [id]))).rejects.toThrow(/Estagiário/);
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.contrato_parcela_marcar($1, 'paga', '2026-11-09')", [id]));
    expect((await db.client.query("select status, paga_em::text as p from public.contrato_parcelas where id = $1", [id])).rows[0]).toEqual({ status: "paga", p: "2026-11-09" });
    await expect(db.comoUsuario(comoSocioB, (c) => c.query("select public.contrato_parcela_marcar($1, 'paga')", [id]))).rejects.toThrow(/não encontrada/);
    const vistosPorB = await db.comoUsuario(comoSocioB, async (c) => (await c.query("select count(*)::int as n from public.contratos")).rows[0].n);
    expect(vistosPorB).toBe(0);
  });
});
