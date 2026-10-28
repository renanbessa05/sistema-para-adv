import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { montarCnj } from "../../src/lib/cnj/numero-cnj";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Prova, num Postgres real, as migrations 0009 a 0013:
 * 1. app.custo_ia calcula com os preços versionados de ref.ia_precos;
 * 2. aprovações: só advogado/sócio decide, via RPC, e a decisão grava quem, quando e tempo de revisão;
 * 3. notificações: só o destinatário e o sócio veem; só o destinatário marca como lida;
 * 4. fila própria: leitura com bloqueio, retentativa e encerramento após o máximo;
 * 5. webhooks_inbox é idempotente por (fonte, id_externo);
 * 6. conversas e mensagens isoladas por escritório e por usuário;
 * 7. métricas: só sócio lê, e sempre pela função (a view não é exposta).
 */
describe("ia, aprovações, notificações, conversas, fila e métricas", () => {
  let db: BancoDeTeste;
  const escritorioA = "11111111-1111-4111-8111-111111111111";
  const escritorioB = "22222222-2222-4222-8222-222222222222";
  const socioA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const advogadoA = "abababab-abab-4bab-8bab-abababababab";
  const estagiarioA = "acacacac-acac-4cac-8cac-acacacacacac";
  const socioB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const comoSocioA = <T>(fn: (c: BancoDeTeste["client"]) => Promise<T>) => db.comoUsuario({ sub: socioA, escritorio_id: escritorioA, papel: "socio" }, fn);
  const comoAdvogadoA = <T>(fn: (c: BancoDeTeste["client"]) => Promise<T>) => db.comoUsuario({ sub: advogadoA, escritorio_id: escritorioA, papel: "advogado" }, fn);
  const comoEstagiarioA = <T>(fn: (c: BancoDeTeste["client"]) => Promise<T>) => db.comoUsuario({ sub: estagiarioA, escritorio_id: escritorioA, papel: "estagiario" }, fn);
  const comoSocioB = <T>(fn: (c: BancoDeTeste["client"]) => Promise<T>) => db.comoUsuario({ sub: socioB, escritorio_id: escritorioB, papel: "socio" }, fn);

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
      `insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo)
       values ($1, $2, 'socio.a@teste.local', 'socio', 'Sócia A'),
              ($1, $3, 'adv.a@teste.local', 'advogado', 'Advogado A'),
              ($1, $4, 'est.a@teste.local', 'estagiario', 'Estagiário A'),
              ($5, $6, 'socio.b@teste.local', 'socio', 'Sócio B')`,
      [escritorioA, socioA, advogadoA, estagiarioA, escritorioB, socioB],
    );
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  it("app.custo_ia usa o preço vigente de ref.ia_precos e o trigger preenche o custo da execução", async () => {
    // Haiku 5.5: 1.000.000 input (US$ 0,10) + 100.000 output (US$ 0,05) = US$ 0,15
    const { rows } = await db.client.query(
      "select app.custo_ia('claude-haiku-5-5', 1000000, 100000, 0, 0, '2026-10-28') as haiku, app.custo_ia('claude-sonnet-5-5', 1000000, 0, 1000000, 1000000, '2026-10-28') as sonnet, app.custo_ia('modelo-inexistente', 1, 1, 0, 0, '2026-10-28') as nulo, app.custo_ia('claude-haiku-5-5', 1, 1, 0, 0, '2020-01-01') as antes_da_vigencia",
    );
    expect(Number(rows[0].haiku)).toBeCloseTo(0.15, 6);
    expect(Number(rows[0].sonnet)).toBeCloseTo(2.0 + 2.5 + 0.1, 6);
    expect(rows[0].nulo).toBeNull();
    expect(rows[0].antes_da_vigencia).toBeNull();

    const exec = await db.client.query(
      "insert into public.ia_execucoes (escritorio_id, agente, modelo, input_tokens, output_tokens) values ($1, 'classificador', 'claude-haiku-5-5', 1000000, 100000) returning custo_estimado, ia_preco_id",
      [escritorioA],
    );
    expect(Number(exec.rows[0].custo_estimado)).toBeCloseTo(0.15, 6);
    expect(exec.rows[0].ia_preco_id).not.toBeNull();

    // Custos: só sócio lê
    const vistoPeloSocio = await comoSocioA(async (c) => (await c.query("select count(*)::int as n from public.ia_execucoes")).rows[0].n);
    expect(vistoPeloSocio).toBe(1);
    const vistoPeloAdvogado = await comoAdvogadoA(async (c) => (await c.query("select count(*)::int as n from public.ia_execucoes")).rows[0].n);
    expect(vistoPeloAdvogado).toBe(0);
    const vistoPorB = await comoSocioB(async (c) => (await c.query("select count(*)::int as n from public.ia_execucoes")).rows[0].n);
    expect(vistoPorB).toBe(0);
  });

  it("aprovação: estagiário não decide; sócio decide via RPC e a decisão fica registrada", async () => {
    const objetoId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const { rows } = await db.client.query(
      "insert into public.aprovacoes (escritorio_id, objeto_tipo, objeto_id, solicitada_por_tipo, conteudo_snapshot) values ($1, 'minuta', $2, 'ia', '{\"texto\": \"rascunho\"}') returning id",
      [escritorioA, objetoId],
    );
    const id = rows[0].id as string;

    await expect(comoEstagiarioA((c) => c.query("select public.decidir_aprovacao($1, 'aprovada')", [id]))).rejects.toThrow(/Apenas advogado ou sócio/);

    // UPDATE direto não decide (policy restritiva): zero linhas afetadas, sem mudança
    const atualizadas = await comoSocioA(async (c) => (await c.query("update public.aprovacoes set status = 'aprovada' where id = $1", [id])).rowCount);
    expect(atualizadas).toBe(0);
    const aindaPendente = await db.client.query("select status from public.aprovacoes where id = $1", [id]);
    expect(aindaPendente.rows[0].status).toBe("pendente");

    // Sócio de outro escritório não alcança
    await expect(comoSocioB((c) => c.query("select public.decidir_aprovacao($1, 'aprovada')", [id]))).rejects.toThrow(/não encontrada/);

    // "ajustada" exige os ajustes
    await expect(comoSocioA((c) => c.query("select public.decidir_aprovacao($1, 'ajustada')", [id]))).rejects.toThrow(/exige os ajustes/);

    const decidida = await comoSocioA(async (c) => (await c.query("select * from public.decidir_aprovacao($1, 'aprovada', 'ok', null, 15)", [id])).rows[0]);
    expect(decidida.status).toBe("aprovada");
    expect(decidida.aprovador_id).toBe(socioA);
    expect(decidida.decidida_em).not.toBeNull();
    expect(decidida.comentario).toBe("ok");
    expect(decidida.tempo_economizado_auto_relatado_min).toBe(15);
    expect(decidida.tempo_revisao_humana_s).toBeGreaterThanOrEqual(0);

    // Não decide duas vezes
    await expect(comoAdvogadoA((c) => c.query("select public.decidir_aprovacao($1, 'rejeitada')", [id]))).rejects.toThrow(/já decidida/);

    // Advogado também decide (objeto que não é prazo)
    const outra = await db.client.query("insert into public.aprovacoes (escritorio_id, objeto_tipo, objeto_id) values ($1, 'mensagem_cliente', $2) returning id", [escritorioA, objetoId]);
    const rejeitada = await comoAdvogadoA(async (c) => (await c.query("select status, aprovador_id from public.decidir_aprovacao($1, 'rejeitada', 'não envie')", [outra.rows[0].id])).rows[0]);
    expect(rejeitada).toEqual({ status: "rejeitada", aprovador_id: advogadoA });
  });

  it("aprovação de prazo: só quem pode agir no processo (quando a tabela prazos existe)", async () => {
    const existe = await db.client.query("select to_regclass('public.prazos') is not null as existe");
    if (!existe.rows[0].existe) return; // migration 0007 ainda não presente: a checagem é ignorada por desenho

    const numero = montarCnj(77, 2025, 8, "11", "0041");
    const processo = await db.client.query("insert into public.processos (escritorio_id, numero_cnj, responsavel_id) values ($1, $2, $3) returning id", [escritorioA, numero, socioA]);
    const colunas = await db.client.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'prazos'");
    const nomes = new Set(colunas.rows.map((r) => r.column_name as string));
    const extras: string[] = [];
    const valores: string[] = [];
    if (nomes.has("data_final")) {
      extras.push("data_final");
      valores.push("'2026-12-01'");
    }
    const prazo = await db.client.query(
      `insert into public.prazos (escritorio_id, processo_id${extras.map((e) => `, ${e}`).join("")}) values ($1, $2${valores.map((v) => `, ${v}`).join("")}) returning id`,
      [escritorioA, processo.rows[0].id],
    );
    const aprovacao = await db.client.query("insert into public.aprovacoes (escritorio_id, objeto_tipo, objeto_id) values ($1, 'prazo', $2) returning id", [escritorioA, prazo.rows[0].id]);
    const id = aprovacao.rows[0].id as string;

    // Advogado que não é responsável nem colaborador: negado
    await expect(comoAdvogadoA((c) => c.query("select public.decidir_aprovacao($1, 'aprovada')", [id]))).rejects.toThrow(/responsável|colaborador|sócio/);
    const ok = await comoSocioA(async (c) => (await c.query("select status from public.decidir_aprovacao($1, 'aprovada')", [id])).rows[0].status);
    expect(ok).toBe("aprovada");
  });

  it("notificação: só o destinatário e o sócio veem; só o destinatário marca como lida", async () => {
    const objetoId = "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0";
    await db.client.query(
      `insert into public.notificacoes (escritorio_id, evento, destinatario_id, canal, template, objeto_tipo, objeto_id, chave_dedup)
       values ($1, 'prazo_d1', $2::uuid, 'painel', 'alerta_prazo', 'prazo', $4::uuid, 'prazo_d1:' || $4::text || ':' || $2::text || ':painel:2026-10-28'),
              ($1, 'tarefa_atrasada', $3::uuid, 'painel', null, 'tarefa', $4::uuid, 'tarefa_atrasada:' || $4::text || ':' || $3::text || ':painel:2026-10-28')`,
      [escritorioA, advogadoA, estagiarioA, objetoId],
    );

    // Deduplicação: mesma chave é recusada
    await expect(
      db.client.query("insert into public.notificacoes (escritorio_id, evento, destinatario_id, canal, chave_dedup) values ($1, 'prazo_d1', $2::uuid, 'painel', 'prazo_d1:' || $3::text || ':' || $2::text || ':painel:2026-10-28')", [escritorioA, advogadoA, objetoId]),
    ).rejects.toThrow(/duplicate key|unique/);

    const doAdvogado = await comoAdvogadoA(async (c) => (await c.query("select destinatario_id from public.notificacoes")).rows.map((r) => r.destinatario_id));
    expect(doAdvogado).toEqual([advogadoA]);
    const doEstagiario = await comoEstagiarioA(async (c) => (await c.query("select destinatario_id from public.notificacoes")).rows.map((r) => r.destinatario_id));
    expect(doEstagiario).toEqual([estagiarioA]);
    const doSocio = await comoSocioA(async (c) => (await c.query("select destinatario_id from public.notificacoes order by evento")).rows.map((r) => r.destinatario_id));
    expect(doSocio.sort()).toEqual([advogadoA, estagiarioA].sort());
    const deB = await comoSocioB(async (c) => (await c.query("select count(*)::int as n from public.notificacoes")).rows[0].n);
    expect(deB).toBe(0);

    // Usuário não insere nem altera notificação diretamente (sem policy de escrita)
    await expect(
      comoAdvogadoA((c) => c.query("insert into public.notificacoes (escritorio_id, evento, destinatario_id, canal, chave_dedup) values ($1, 'convite', $2, 'painel', 'x')", [escritorioA, advogadoA])),
    ).rejects.toThrow(/permission denied|row-level security/);

    const { rows } = await db.client.query("select id from public.notificacoes where destinatario_id = $1", [advogadoA]);
    const id = rows[0].id as string;
    // Nem o sócio marca a notificação de outro como lida
    await expect(comoSocioA((c) => c.query("select public.marcar_notificacao_lida($1)", [id]))).rejects.toThrow(/não encontrada/);
    await comoAdvogadoA((c) => c.query("select public.marcar_notificacao_lida($1)", [id]));
    const lida = await db.client.query("select status, lida_em from public.notificacoes where id = $1", [id]);
    expect(lida.rows[0].status).toBe("lida");
    expect(lida.rows[0].lida_em).not.toBeNull();
  });

  it("ausência: o próprio usuário, sócio e administrativo; estagiário não vê a dos outros", async () => {
    await db.client.query("insert into public.ausencias (escritorio_id, usuario_id, inicio, fim, tipo, substituto_id) values ($1, $2, '2026-12-20', '2027-01-06', 'ferias', $3)", [escritorioA, advogadoA, socioA]);
    const doEstagiario = await comoEstagiarioA(async (c) => (await c.query("select count(*)::int as n from public.ausencias")).rows[0].n);
    expect(doEstagiario).toBe(0);
    const doAdvogado = await comoAdvogadoA(async (c) => (await c.query("select count(*)::int as n from public.ausencias")).rows[0].n);
    expect(doAdvogado).toBe(1);
    const doSocio = await comoSocioA(async (c) => (await c.query("select count(*)::int as n from public.ausencias")).rows[0].n);
    expect(doSocio).toBe(1);
    await expect(db.client.query("insert into public.ausencias (escritorio_id, usuario_id, inicio, fim) values ($1, $2, '2026-12-20', '2026-12-19')", [escritorioA, advogadoA])).rejects.toThrow(/ausencia_periodo_valido/);
  });

  it("fila própria: enfileirar, ler com bloqueio, concluir, falhar com retentativa e encerrar após o máximo", async () => {
    const c = db.client; // superusuário faz o papel da service role
    const ids: number[] = [];
    for (let i = 1; i <= 3; i++) {
      const { rows } = await c.query("select public.fila_enfileirar('classificacao', $1, $2::jsonb) as id", [escritorioA, JSON.stringify({ n: i })]);
      ids.push(Number(rows[0].id));
    }
    // Mensagem com atraso não aparece ainda
    await c.query("select public.fila_enfileirar('classificacao', $1, '{}'::jsonb, 3600)", [escritorioA]);

    const lote1 = await c.query("select id, tentativas, bloqueada_ate from public.fila_ler('classificacao', 2)");
    expect(lote1.rows.map((r) => Number(r.id))).toEqual([ids[0], ids[1]]);
    for (const r of lote1.rows) {
      expect(r.tentativas).toBe(1);
      expect(new Date(r.bloqueada_ate).getTime()).toBeGreaterThan(Date.now() - 1000);
    }

    const lote2 = await c.query("select id from public.fila_ler('classificacao', 2)");
    expect(lote2.rows.map((r) => Number(r.id))).toEqual([ids[2]]);

    const vazio = await c.query("select id from public.fila_ler('classificacao', 2)");
    expect(vazio.rows).toEqual([]);

    await c.query("select public.fila_concluir($1)", [ids[0]]);
    const concluida = await c.query("select concluida_em, erro from public.fila_mensagens where id = $1", [ids[0]]);
    expect(concluida.rows[0].concluida_em).not.toBeNull();
    expect(concluida.rows[0].erro).toBeNull();

    // Falha com retentativa: volta à fila com atraso
    await c.query("select public.fila_falhar($1, 'timeout', 120)", [ids[1]]);
    const retentar = await c.query("select concluida_em, erro, bloqueada_ate, disponivel_em > now() as adiada, tentativas from public.fila_mensagens where id = $1", [ids[1]]);
    expect(retentar.rows[0]).toMatchObject({ concluida_em: null, erro: "timeout", bloqueada_ate: null, adiada: true, tentativas: 1 });

    // Falha além do máximo encerra com erro
    await c.query("update public.fila_mensagens set max_tentativas = 1 where id = $1", [ids[2]]);
    await c.query("select public.fila_falhar($1, 'schema inválido')", [ids[2]]);
    const encerrada = await c.query("select concluida_em, erro from public.fila_mensagens where id = $1", [ids[2]]);
    expect(encerrada.rows[0].concluida_em).not.toBeNull();
    expect(encerrada.rows[0].erro).toBe("schema inválido");

    // Nada mais disponível agora (a adiada e a com atraso ainda não venceram)
    const depois = await c.query("select id from public.fila_ler('classificacao', 10)");
    expect(depois.rows).toEqual([]);

    // Usuário autenticado não enxerga a fila nem as funções
    await expect(comoSocioA((cu) => cu.query("select count(*) from public.fila_mensagens"))).rejects.toThrow(/permission denied/);
    await expect(comoSocioA((cu) => cu.query("select public.fila_enfileirar('x', $1, '{}'::jsonb)", [escritorioA]))).rejects.toThrow(/permission denied/);
    await expect(comoSocioA((cu) => cu.query("select count(*) from public.jobs_execucoes"))).rejects.toThrow(/permission denied/);
  });

  it("integrações: sócio lê a configuração; app.segredo devolve null sem Vault", async () => {
    await db.client.query("insert into public.integracoes (escritorio_id, tipo, config, vault_secret_id, status) values ($1, 'whatsapp', '{\"phone_number_id\": \"123\"}', gen_random_uuid(), 'ativa')", [escritorioA]);
    const doSocio = await comoSocioA(async (c) => (await c.query("select tipo, config from public.integracoes")).rows);
    expect(doSocio).toEqual([{ tipo: "whatsapp", config: { phone_number_id: "123" } }]);
    const doAdvogado = await comoAdvogadoA(async (c) => (await c.query("select count(*)::int as n from public.integracoes")).rows[0].n);
    expect(doAdvogado).toBe(0);
    const { rows } = await db.client.query("select app.segredo($1, 'whatsapp') as s", [escritorioA]);
    expect(rows[0].s).toBeNull();
    await expect(comoSocioA((c) => c.query("select app.segredo($1, 'whatsapp')", [escritorioA]))).rejects.toThrow(/permission denied/);
  });

  it("webhooks_inbox é idempotente por (fonte, id_externo) e só a service role acessa", async () => {
    await db.client.query("insert into public.webhooks_inbox (fonte, id_externo, payload) values ('meta', 'wamid.1', '{}')");
    await expect(db.client.query("insert into public.webhooks_inbox (fonte, id_externo, payload) values ('meta', 'wamid.1', '{\"outro\": true}')")).rejects.toThrow(/duplicate key|unique/);
    await db.client.query("insert into public.webhooks_inbox (fonte, id_externo, payload) values ('datajud', 'wamid.1', '{}')");
    await expect(comoSocioA((c) => c.query("select count(*) from public.webhooks_inbox"))).rejects.toThrow(/permission denied/);
  });

  it("conversas e mensagens: isoladas por escritório; só o usuário da conversa ou sócio", async () => {
    const conversaA = await db.client.query(
      "insert into public.conversas (escritorio_id, canal, usuario_id, telefone_e164) values ($1, 'whatsapp', $2, '+5565999990001') returning id",
      [escritorioA, advogadoA],
    );
    const conversaB = await db.client.query(
      "insert into public.conversas (escritorio_id, canal, usuario_id, telefone_e164) values ($1, 'whatsapp', $2, '+5565999990002') returning id",
      [escritorioB, socioB],
    );
    // Mesmo telefone pode existir em outro escritório, mas não repetir no mesmo
    await db.client.query("insert into public.conversas (escritorio_id, canal, usuario_id, telefone_e164) values ($1, 'whatsapp', $2, '+5565999990001')", [escritorioB, socioB]);
    await expect(db.client.query("insert into public.conversas (escritorio_id, canal, telefone_e164) values ($1, 'whatsapp', '+5565999990001')", [escritorioA])).rejects.toThrow(/duplicate key|unique/);

    await db.client.query(
      "insert into public.mensagens (escritorio_id, conversa_id, direcao, id_externo, texto) values ($1, $2, 'entrada', 'wamid.a1', 'quais os prazos de hoje?'), ($1, $2, 'saida', 'wamid.a2', 'Nenhum prazo hoje.'), ($3, $4, 'saida', 'wamid.b1', 'Olá')",
      [escritorioA, conversaA.rows[0].id, escritorioB, conversaB.rows[0].id],
    );
    await expect(db.client.query("insert into public.mensagens (escritorio_id, conversa_id, direcao, id_externo) values ($1, $2, 'entrada', 'wamid.a1')", [escritorioA, conversaA.rows[0].id])).rejects.toThrow(/duplicate key|unique/);

    const doAdvogado = await comoAdvogadoA(async (c) => ({
      conversas: (await c.query("select telefone_e164 from public.conversas")).rows.map((r) => r.telefone_e164),
      mensagens: (await c.query("select count(*)::int as n from public.mensagens")).rows[0].n,
    }));
    expect(doAdvogado).toEqual({ conversas: ["+5565999990001"], mensagens: 2 });

    const doEstagiario = await comoEstagiarioA(async (c) => ({
      conversas: (await c.query("select count(*)::int as n from public.conversas")).rows[0].n,
      mensagens: (await c.query("select count(*)::int as n from public.mensagens")).rows[0].n,
    }));
    expect(doEstagiario).toEqual({ conversas: 0, mensagens: 0 });

    const doSocioA = await comoSocioA(async (c) => (await c.query("select count(*)::int as n from public.mensagens")).rows[0].n);
    expect(doSocioA).toBe(2);

    const doSocioB = await comoSocioB(async (c) => ({
      conversas: (await c.query("select telefone_e164 from public.conversas order by telefone_e164")).rows.map((r) => r.telefone_e164),
      mensagens: (await c.query("select texto from public.mensagens")).rows.map((r) => r.texto),
    }));
    expect(doSocioB).toEqual({ conversas: ["+5565999990001", "+5565999990002"], mensagens: ["Olá"] });

    // Estagiário não cria mensagem em conversa que não é sua
    await expect(
      comoEstagiarioA((c) => c.query("insert into public.mensagens (escritorio_id, conversa_id, direcao, texto) values ($1, $2, 'saida', 'x')", [escritorioA, conversaA.rows[0].id])),
    ).rejects.toThrow(/row-level security/);

    // Templates: escritório lê, só sócio escreve
    await expect(
      comoAdvogadoA((c) => c.query("insert into public.whatsapp_templates (escritorio_id, nome, corpo) values ($1, 'alerta_prazo', 'Prazo {{1}} vence em {{2}}')", [escritorioA])),
    ).rejects.toThrow(/row-level security/);
    await comoSocioA((c) => c.query("insert into public.whatsapp_templates (escritorio_id, nome, corpo) values ($1, 'alerta_prazo', 'Prazo {{1}} vence em {{2}}')", [escritorioA]));
    const templates = await comoEstagiarioA(async (c) => (await c.query("select nome, status_meta from public.whatsapp_templates")).rows);
    expect(templates).toEqual([{ nome: "alerta_prazo", status_meta: "rascunho" }]);
  });

  it("métricas: refresh pela service role; leitura só por sócio e só pela função", async () => {
    await db.client.query("select public.atualizar_metricas_diarias()");

    const doSocio = await comoSocioA(async (c) => (await c.query("select * from public.metricas_do_escritorio()")).rows);
    expect(Array.isArray(doSocio)).toBe(true);
    expect(doSocio.length).toBeGreaterThan(0);
    for (const linha of doSocio) {
      expect(linha.escritorio_id).toBe(escritorioA);
    }
    const hoje = doSocio.find((l) => Number(l.custo_ia_total) > 0);
    expect(hoje).toBeDefined();
    expect(Number(hoje!.custo_ia_total)).toBeCloseTo(0.15, 6);
    expect(hoje!.mensagens_whatsapp_enviadas).toBe(1);
    expect(Number(hoje!.tempo_revisao_medio_s)).toBeGreaterThanOrEqual(0);

    await expect(comoAdvogadoA((c) => c.query("select * from public.metricas_do_escritorio()"))).rejects.toThrow(/Apenas sócio/);
    await expect(comoEstagiarioA((c) => c.query("select * from public.metricas_do_escritorio()"))).rejects.toThrow(/Apenas sócio/);
    // A view não é exposta nem ao sócio: só pela função
    await expect(comoSocioA((c) => c.query("select * from public.metricas_diarias"))).rejects.toThrow(/permission denied/);
    await expect(comoSocioA((c) => c.query("select public.atualizar_metricas_diarias()"))).rejects.toThrow(/permission denied/);

    // Exportações: sócio lê, advogado não
    await db.client.query("insert into public.exportacoes (escritorio_id, tipo, caminho_storage, linhas) values ($1::uuid, 'prazos_csv', $1::text || '/prazos/2026-10-28.csv', 12)", [escritorioA]);
    const exportacoesSocio = await comoSocioA(async (c) => (await c.query("select tipo, linhas from public.exportacoes")).rows);
    expect(exportacoesSocio).toEqual([{ tipo: "prazos_csv", linhas: 12 }]);
    const exportacoesAdvogado = await comoAdvogadoA(async (c) => (await c.query("select count(*)::int as n from public.exportacoes")).rows[0].n);
    expect(exportacoesAdvogado).toBe(0);
  });
});
