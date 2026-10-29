import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { montarCnj } from "../../src/lib/cnj/numero-cnj";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Migrations 0051 e 0052 (atendimento ao cliente por WhatsApp, lote 14).
 * ESCRITO, NÃO EXECUTADO NESTA SESSÃO: roda com `pnpm test` quando houver Postgres local (ou DATABASE_URL_TESTE).
 *
 * Prova:
 * 1. envio ao cliente desligado por padrão e não liga sem horário configurado;
 * 2. a aprovação de mensagem de cliente só põe o texto na fila com envio ligado, consentimento vigente e processo não sigiloso;
 * 3. rejeitada, sem consentimento ou com processo sigiloso, nada entra na fila;
 * 4. advogado não escreve mensagem de cliente direto (só o sistema, pelo service role);
 * 5. estagiário não vê contatos de cliente; consentimento exige contato verificado.
 */
describe("atendimento ao cliente", () => {
  let db: BancoDeTeste;
  const esc = "11111111-1111-4111-8111-111111111111";
  const socio = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const advogado = "abababab-abab-4bab-8bab-abababababab";
  const estagiario = "acacacac-acac-4cac-8cac-acacacacacac";
  const comoSocio = { sub: socio, escritorio_id: esc, papel: "socio" };
  const comoAdvogado = { sub: advogado, escritorio_id: esc, papel: "advogado" };
  const comoEstagiario = { sub: estagiario, escritorio_id: esc, papel: "estagiario" };
  const telefone = "+5565999990000";
  let clienteId: string;
  let contatoId: string;
  let conversaId: string;
  let processoSigiloso: string;
  let processoAberto: string;

  /** Cria uma mensagem de saída em rascunho com a aprovação pendente (pelo sistema) e devolve a aprovação. */
  const rascunho = async (processo: string | null, texto: string) => {
    const snapshot = processo ? { processo_id: processo } : {};
    const r = await db.client.query("select public.criar_rascunho_cliente($1, $2, $3, null, $4) as msg", [esc, conversaId, texto, JSON.stringify(snapshot)]);
    const msg = r.rows[0].msg as string;
    const a = await db.client.query("select aprovacao_id from public.mensagens where id = $1", [msg]);
    return { msg, aprovacao: a.rows[0].aprovacao_id as string };
  };

  const decidir = (aprovacao: string, decisao: "aprovada" | "rejeitada" | "ajustada", ajustes: unknown = null) =>
    db.comoUsuario(comoAdvogado, (c) => c.query("select public.decidir_aprovacao($1, $2::public.aprovacao_status, null, $3::jsonb, null)", [aprovacao, decisao, ajustes === null ? null : JSON.stringify(ajustes)]));

  const filaDo = async () => (await db.client.query("select count(*)::int as n from public.fila_mensagens where fila = 'mensagens_cliente' and concluida_em is null")).rows[0].n as number;

  beforeAll(async () => {
    db = await subirBancoDeTeste();
    const c = db.client;
    for (const [id, email] of [
      [socio, "socio@t.local"],
      [advogado, "adv@t.local"],
      [estagiario, "est@t.local"],
    ]) {
      await c.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
    }
    await c.query("insert into public.escritorios (id, nome) values ($1, 'Escritório Teste')", [esc]);
    await c.query(
      `insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, aceito_em)
       values ($1, $2, 'socio@t.local', 'socio', 'Sócio', now()), ($1, $3, 'adv@t.local', 'advogado', 'Adv', now()), ($1, $4, 'est@t.local', 'estagiario', 'Est', now())`,
      [esc, socio, advogado, estagiario],
    );
    const cli = await c.query("insert into public.clientes (escritorio_id, nome) values ($1, 'Cliente Teste') returning id", [esc]);
    clienteId = cli.rows[0].id as string;
    const procs = await c.query(
      "insert into public.processos (escritorio_id, numero_cnj, responsavel_id, segredo_justica) values ($1, $2, $3, false), ($1, $4, $3, true) returning id, segredo_justica",
      [esc, montarCnj(1, 2025, 8, "11", "0041"), advogado, montarCnj(2, 2025, 8, "11", "0041")],
    );
    processoAberto = procs.rows.find((r) => !r.segredo_justica)!.id as string;
    processoSigiloso = procs.rows.find((r) => r.segredo_justica)!.id as string;
    await c.query("insert into public.processo_partes (escritorio_id, processo_id, nome, cliente_id, eh_cliente) values ($1, $2, 'Cliente Teste', $3, true), ($1, $4, 'Cliente Teste', $3, true)", [esc, processoAberto, clienteId, processoSigiloso]);
    const contato = await c.query("insert into public.clientes_contatos (escritorio_id, cliente_id, telefone_e164) values ($1, $2, $3) returning id", [esc, clienteId, telefone]);
    contatoId = contato.rows[0].id as string;
    const conv = await c.query("insert into public.conversas (escritorio_id, canal, cliente_id, telefone_e164) values ($1, 'whatsapp', $2, $3) returning id", [esc, clienteId, telefone]);
    conversaId = conv.rows[0].id as string;
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  it("envio vem desligado e não liga sem horário configurado", async () => {
    const r = await db.client.query("select envio_ativo from public.regras_atendimento where escritorio_id = $1", [esc]);
    expect(r.rows.length === 0 || r.rows[0].envio_ativo === false).toBe(true);
    await expect(db.client.query("insert into public.regras_atendimento (escritorio_id, envio_ativo) values ($1, true)", [esc])).rejects.toThrow();
  });

  it("rascunho da IA nasce sem status e só o sistema cria rascunho", async () => {
    await expect(db.comoUsuario(comoAdvogado, (c) => c.query("select public.criar_rascunho_cliente($1, $2, 'x', null, '{}'::jsonb)", [esc, conversaId]))).rejects.toThrow();
    const { msg, aprovacao } = await rascunho(null, "Rascunho de teste");
    const m = await db.client.query("select status_entrega, aprovacao_id from public.mensagens where id = $1", [msg]);
    expect(m.rows[0]).toEqual({ status_entrega: null, aprovacao_id: aprovacao });
  });

  it("aprovada com envio desligado não entra na fila e registra o motivo", async () => {
    const { msg, aprovacao } = await rascunho(null, "Texto aprovado");
    await decidir(aprovacao, "aprovada");
    const m = await db.client.query("select status_entrega, erro from public.mensagens where id = $1", [msg]);
    expect(m.rows[0].status_entrega).toBe("falhou");
    expect(m.rows[0].erro).toMatch(/desligado/);
  });

  it("com envio ligado, consentimento vigente e processo aberto, aprovada vai para a fila", async () => {
    await db.client.query("insert into public.regras_atendimento (escritorio_id, envio_ativo, horario_inicio, horario_fim, dias_semana) values ($1, true, '08:00', '18:00', '{1,2,3,4,5}') on conflict (escritorio_id) do update set envio_ativo = true, horario_inicio = '08:00', horario_fim = '18:00', dias_semana = '{1,2,3,4,5}'", [esc]);
    await db.client.query("update public.clientes_contatos set verificado_em = now(), opt_in_em = now() where id = $1", [contatoId]);
    const antes = await filaDo();
    const { msg, aprovacao } = await rascunho(processoAberto, "Texto aprovado para fila");
    await decidir(aprovacao, "aprovada");
    expect((await db.client.query("select status_entrega from public.mensagens where id = $1", [msg])).rows[0].status_entrega).toBe("enfileirada");
    expect(await filaDo()).toBe(antes + 1);
  });

  it("processo sigiloso nunca entra na fila, mesmo com tudo liberado", async () => {
    const antes = await filaDo();
    const { msg, aprovacao } = await rascunho(processoSigiloso, "Texto de processo sigiloso");
    await decidir(aprovacao, "aprovada");
    const m = await db.client.query("select status_entrega, erro from public.mensagens where id = $1", [msg]);
    expect(m.rows[0].status_entrega).toBe("falhou");
    expect(m.rows[0].erro).toMatch(/segredo de justiça/);
    expect(await filaDo()).toBe(antes);
  });

  it("opt-out vigente bloqueia a aprovada", async () => {
    await db.client.query("update public.clientes_contatos set opt_out_em = now() where id = $1", [contatoId]);
    const antes = await filaDo();
    const { aprovacao } = await rascunho(null, "Texto após opt-out");
    await decidir(aprovacao, "aprovada");
    expect(await filaDo()).toBe(antes);
    await db.client.query("update public.clientes_contatos set opt_out_em = null where id = $1", [contatoId]);
  });

  it("rejeitada não entra na fila; ajustada manda o texto de ajustes", async () => {
    const antes = await filaDo();
    const { aprovacao } = await rascunho(null, "Texto rejeitado");
    await decidir(aprovacao, "rejeitada");
    expect(await filaDo()).toBe(antes);
    const outro = await rascunho(null, "Texto original");
    await decidir(outro.aprovacao, "ajustada", { texto: "Texto ajustado pela advogada" });
    const m = await db.client.query("select texto, status_entrega from public.mensagens where id = $1", [outro.msg]);
    expect(m.rows[0]).toEqual({ texto: "Texto ajustado pela advogada", status_entrega: "enfileirada" });
  });

  it("advogado não escreve mensagem de cliente direto; só lê", async () => {
    await expect(db.comoUsuario(comoAdvogado, (c) => c.query("insert into public.mensagens (escritorio_id, conversa_id, direcao, texto) values ($1, $2, 'saida', 'direto')", [esc, conversaId]))).rejects.toThrow();
    const r = await db.comoUsuario(comoAdvogado, (c) => c.query("select id from public.conversas where id = $1", [conversaId]));
    expect(r.rows.length).toBe(1);
  });

  it("estagiário não vê contatos de cliente; consentimento exige contato verificado", async () => {
    const r = await db.comoUsuario(comoEstagiario, (c) => c.query("select id from public.clientes_contatos"));
    expect(r.rows.length).toBe(0);
    const novo = await db.client.query("insert into public.clientes_contatos (escritorio_id, cliente_id, telefone_e164) values ($1, $2, '+5565988880000') returning id", [esc, clienteId]);
    await expect(db.comoUsuario(comoSocio, (c) => c.query("select public.cliente_contato_consentimento($1, true)", [novo.rows[0].id]))).rejects.toThrow(/verificado/);
  });
});
