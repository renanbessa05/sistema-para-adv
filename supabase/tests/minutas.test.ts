import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { montarCnj } from "../../src/lib/cnj/numero-cnj";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Migration 0031 (minutas, etapas, versões, análises, modelos):
 * 1. etapas aprovadas na ordem; estagiário não aprova; devolver exige comentário; pular registra as puladas;
 * 2. enviar para aprovação exige versão; lacuna sem comentário bloqueia; citação sem id bloqueia;
 * 3. efeito da aprovação: aprovada → aprovada; rejeitada → devolvida; ajustada → nova versão da advogada;
 * 4. minuta de processo sigiloso invisível para quem não pode ver; outro escritório não vê nada;
 * 5. modelo de peça só por advogado/sócio.
 */
describe("minutas em etapas", () => {
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
  let processoAberto: string;
  let processoSigiloso: string;
  let minuta: string;

  const inserirEtapa = (n: number, md = `etapa ${n}`) => db.comoUsuario(comoAdvogadoA, (c) => c.query("insert into public.minuta_etapas (escritorio_id, minuta_id, numero, conteudo_md, status) values ($1, $2, $3, $4, 'gerada') on conflict (minuta_id, numero) do update set conteudo_md = excluded.conteudo_md, status = 'gerada'", [escA, minuta, n, md]));
  const inserirVersao = (n: number, validacao: Record<string, unknown>) =>
    db.comoUsuario(comoAdvogadoA, async (c) => {
      const r = await c.query("insert into public.minuta_versoes (escritorio_id, minuta_id, numero, autor_tipo, conteudo_md, validacao) values ($1, $2, $3, 'ia', 'peça', $4) returning id", [escA, minuta, n, JSON.stringify(validacao)]);
      await c.query("update public.minutas set versao_atual_id = $2, status = 'redigida', etapa_atual = 6 where id = $1", [minuta, r.rows[0].id]);
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
    const procs = await c.query("insert into public.processos (escritorio_id, numero_cnj, responsavel_id, segredo_justica) values ($1, $2, $3, false), ($1, $4, $3, true) returning id, segredo_justica", [escA, montarCnj(1, 2025, 8, "11", "0041"), advogadoA, montarCnj(2, 2025, 8, "11", "0041")]);
    processoAberto = procs.rows.find((r) => !r.segredo_justica)!.id as string;
    processoSigiloso = procs.rows.find((r) => r.segredo_justica)!.id as string;
    minuta = await db.comoUsuario(comoEstagiarioA, async (cl) => (await cl.query("insert into public.minutas (escritorio_id, processo_id, tipo_peca, area, titulo, modo, criado_por) values ($1, $2, 'inicial', 'consumidor', 'Inicial Marina', 'C', $3) returning id", [escA, processoAberto, estagiarioA])).rows[0].id as string);
    await db.comoUsuario(comoSocioA, (cl) => cl.query("insert into public.minutas (escritorio_id, processo_id, tipo_peca, area, titulo, modo) values ($1, $2, 'contestacao', 'civel', 'Sigilosa', 'A')", [escA, processoSigiloso]));
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  it("aprova etapas na ordem; estagiário não aprova; devolver exige comentário; pular registra", async () => {
    await inserirEtapa(1);
    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.minuta_aprovar_etapa($1, 1)", [minuta]))).rejects.toThrow(/advogado ou sócio/);
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.minuta_aprovar_etapa($1, 2)", [minuta]))).rejects.toThrow(/ainda não foi gerada|etapa atual/);
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.minuta_aprovar_etapa($1, 1, 'ok')", [minuta]));
    expect((await db.client.query("select etapa_atual, status from public.minutas where id = $1", [minuta])).rows[0]).toEqual({ etapa_atual: 2, status: "em_etapas" });
    await inserirEtapa(2);
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.minuta_devolver_etapa($1, 2, '  ')", [minuta]))).rejects.toThrow(/comentário/);
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.minuta_devolver_etapa($1, 2, 'refazer teses')", [minuta]));
    expect((await db.client.query("select status, comentarios from public.minuta_etapas where minuta_id = $1 and numero = 2", [minuta])).rows[0]).toEqual({ status: "devolvida", comentarios: "refazer teses" });
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.minuta_pular_etapas($1, 6, 'urgência')", [minuta]));
    const puladas = await db.client.query("select numero, status::text as status from public.minuta_etapas where minuta_id = $1 order by numero", [minuta]);
    expect(puladas.rows.map((r) => `${r.numero}:${r.status}`)).toEqual(["1:aprovada", "2:pulada", "3:pulada", "4:pulada", "5:pulada"]);
    expect((await db.client.query("select etapa_atual from public.minutas where id = $1", [minuta])).rows[0].etapa_atual).toBe(6);
  });

  it("enviar para aprovação exige versão sem lacuna (ou comentário) e sem citação sem id", async () => {
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.minuta_enviar_aprovacao($1)", [minuta]))).rejects.toThrow(/Redija a peça/);
    await inserirVersao(1, { lacunas: 2, citacoes_sem_id: [] });
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.minuta_enviar_aprovacao($1)", [minuta]))).rejects.toThrow(/lacuna/);
    await inserirVersao(2, { lacunas: 0, citacoes_sem_id: ["REsp 1"] });
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.minuta_enviar_aprovacao($1)", [minuta]))).rejects.toThrow(/jurisprudência/);
    await inserirVersao(3, { lacunas: 1, citacoes_sem_id: [] });
    const aprovacao = await db.comoUsuario(comoAdvogadoA, async (c) => (await c.query("select public.minuta_enviar_aprovacao($1, 'lacuna é a data da audiência, confirmada por telefone') as id", [minuta])).rows[0].id as string);
    expect((await db.client.query("select status from public.minutas where id = $1", [minuta])).rows[0].status).toBe("aguardando_aprovacao");
    // rejeitada → devolvida
    await db.comoUsuario(comoSocioA, (c) => c.query("select public.decidir_aprovacao($1, 'rejeitada', 'não')", [aprovacao]));
    expect((await db.client.query("select status, aprovacao_id from public.minutas where id = $1", [minuta])).rows[0]).toEqual({ status: "devolvida", aprovacao_id: null });
    // ajustada → nova versão da advogada e aprovada
    const ap2 = await db.comoUsuario(comoAdvogadoA, async (c) => (await c.query("select public.minuta_enviar_aprovacao($1, 'ok') as id", [minuta])).rows[0].id as string);
    await db.comoUsuario(comoSocioA, (c) => c.query("select public.decidir_aprovacao($1, 'ajustada', 'troquei o pedido', $2::jsonb)", [ap2, JSON.stringify({ conteudo_md: "peça ajustada pela sócia" })]));
    const depois = await db.client.query("select m.status, v.numero, v.autor_tipo::text as autor, v.conteudo_md from public.minutas m join public.minuta_versoes v on v.id = m.versao_atual_id where m.id = $1", [minuta]);
    expect(depois.rows[0]).toEqual({ status: "aprovada", numero: 4, autor: "usuario", conteudo_md: "peça ajustada pela sócia" });
    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.minuta_marcar_protocolada($1, 'P-1')", [minuta]))).rejects.toThrow(/advogado ou sócio/);
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.minuta_marcar_protocolada($1, 'P-1')", [minuta]));
    expect((await db.client.query("select status, protocolo_numero from public.minutas where id = $1", [minuta])).rows[0]).toEqual({ status: "protocolada", protocolo_numero: "P-1" });
  });

  it("sigilo e isolamento; modelo de peça só por advogado/sócio", async () => {
    const titulosEst = await db.comoUsuario(comoEstagiarioA, async (c) => (await c.query("select titulo from public.minutas order by titulo")).rows.map((r) => r.titulo));
    expect(titulosEst).toEqual(["Inicial Marina"]);
    const titulosAdv = await db.comoUsuario(comoAdvogadoA, async (c) => (await c.query("select titulo from public.minutas order by titulo")).rows.map((r) => r.titulo));
    expect(titulosAdv).toEqual(["Inicial Marina", "Sigilosa"]);
    expect(await db.comoUsuario(comoSocioB, async (c) => (await c.query("select count(*)::int as n from public.minutas")).rows[0].n)).toBe(0);
    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("insert into public.modelos_peca (escritorio_id, nome, estrutura_md) values ($1, 'x', 'y')", [escA]))).rejects.toThrow(/row-level security/);
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("insert into public.modelos_peca (escritorio_id, nome, estrutura_md) values ($1, 'Contestação padrão', 'estrutura')", [escA]));
    expect(await db.comoUsuario(comoSocioB, async (c) => (await c.query("select count(*)::int as n from public.modelos_peca")).rows[0].n)).toBe(0);
  });
});
