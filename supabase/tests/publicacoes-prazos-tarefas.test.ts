import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { montarCnj } from "../../src/lib/cnj/numero-cnj";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Migrations 0006 a 0008 (publicações, prazos, tarefas), contra docs/regras/estados.md e permissoes.md:
 * 1. publicação captada nasce 'nova' com evento; estagiário não transiciona; administrativo trata sem_processo;
 * 2. texto e payload_bruto só pela RPC publicacao_texto, que grava auditoria_acessos; sigilo por papel;
 * 3. prazo sugerido → confirmado só pelo advogado responsável/colaborador ou sócio; cria tarefa 'protocolar';
 * 4. calendário incompleto exige reconhecimento; UPDATE direto em prazos é negado;
 * 5. marcar_prazos_vencidos (service role), concluir tarefa com protocolado cumpre o prazo;
 * 6. nada atravessa escritórios em publicacoes, prazos e tarefas.
 */
describe("publicações, prazos e tarefas", () => {
  let db: BancoDeTeste;
  const escritorioA = "11111111-1111-4111-8111-111111111111";
  const escritorioB = "22222222-2222-4222-8222-222222222222";
  const socioA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const advogadoA = "abababab-abab-4bab-8bab-abababababab"; // responsável pelos processos de A
  const advogado2A = "adadadad-adad-4dad-8dad-adadadadadad"; // advogado de A sem vínculo com os processos
  const estagiarioA = "acacacac-acac-4cac-8cac-acacacacacac";
  const adminA = "aeaeaeae-aeae-4eae-8eae-aeaeaeaeaeae";
  const socioB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const advogadoB = "bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc";

  const comoSocioA = { sub: socioA, escritorio_id: escritorioA, papel: "socio" };
  const comoAdvogadoA = { sub: advogadoA, escritorio_id: escritorioA, papel: "advogado" };
  const comoAdvogado2A = { sub: advogado2A, escritorio_id: escritorioA, papel: "advogado" };
  const comoEstagiarioA = { sub: estagiarioA, escritorio_id: escritorioA, papel: "estagiario" };
  const comoAdminA = { sub: adminA, escritorio_id: escritorioA, papel: "administrativo" };
  const comoSocioB = { sub: socioB, escritorio_id: escritorioB, papel: "socio" };

  const cnjA1 = montarCnj(100, 2025, 8, "11", "0041");
  const cnjA2 = montarCnj(101, 2025, 8, "11", "0041"); // sigiloso
  const cnjB1 = montarCnj(200, 2025, 8, "11", "0041");
  let processoA1: string;
  let processoA2: string;
  let processoB1: string;
  let atoContestacaoA: string;

  /** Simula uma requisição com a chave service_role (jobs): JWT com role service_role e papel de banco service_role. */
  const comoServiceRole = async <T>(fn: (c: Client) => Promise<T>): Promise<T> => {
    const c = db.client;
    await c.query("begin");
    try {
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
      await c.query("set local role service_role");
      const r = await fn(c);
      await c.query("commit");
      return r;
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  };

  const inserirPublicacao = (dados: { escritorio: string; idExterno: string; numeroCnj?: string | null; texto?: string }) =>
    comoServiceRole(async (c) => {
      const r = await c.query(
        `insert into public.publicacoes (escritorio_id, fonte, id_externo, hash_dedup, numero_cnj, texto, payload_bruto, data_disponibilizacao, destinatario_advogados)
         values ($1, 'djen', $2, md5($2), $3, $4, '{"id": 1}'::jsonb, '2026-03-06', '[{"nome": "Advogado A", "numero_oab": "30000", "uf_oab": "MT"}]'::jsonb)
         returning id`,
        [dados.escritorio, dados.idExterno, dados.numeroCnj ?? null, dados.texto ?? `Texto da publicação ${dados.idExterno}`],
      );
      return r.rows[0].id as string;
    });

  const inserirPrazo = (dados: { processo: string; publicacao?: string | null; dataFinal: string; dataInterna?: string | null; calendarioIncompleto?: boolean; ato?: string | null }) =>
    comoServiceRole(async (c) => {
      const r = await c.query(
        `insert into public.prazos (escritorio_id, processo_id, publicacao_id, origem, ato_id, ato_descricao, quantidade, data_disponibilizacao, data_publicacao,
                                    data_inicio_contagem, data_final, data_interna, data_sugerida_ia, memoria_calculo, calendario_incompleto, responsavel_id)
         select p.escritorio_id, p.id, $2, 'publicacao_djen', $6, 'Contestação', 15, '2026-03-06', '2026-03-09', '2026-03-10', $3, $4, $3,
                '{"regra": "teste"}'::jsonb, $5, p.responsavel_id
           from public.processos p where p.id = $1
         returning id`,
        [dados.processo, dados.publicacao ?? null, dados.dataFinal, dados.dataInterna ?? null, dados.calendarioIncompleto ?? false, dados.ato ?? null],
      );
      return r.rows[0].id as string;
    });

  /** Transições feitas pelo sistema (job): conexão direta, sem JWT. */
  const transicaoSistema = (id: string, para: string, dados: Record<string, unknown> = {}) =>
    db.client.query("select public.transicionar_publicacao($1, $2, $3::jsonb)", [id, para, JSON.stringify(dados)]);

  beforeAll(async () => {
    db = await subirBancoDeTeste();
    const c = db.client;
    for (const [id, email] of [
      [socioA, "socio.a@teste.local"],
      [advogadoA, "adv.a@teste.local"],
      [advogado2A, "adv2.a@teste.local"],
      [estagiarioA, "est.a@teste.local"],
      [adminA, "adm.a@teste.local"],
      [socioB, "socio.b@teste.local"],
      [advogadoB, "adv.b@teste.local"],
    ]) {
      await c.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
    }
    await c.query("insert into public.escritorios (id, nome) values ($1, 'Escritório A'), ($2, 'Escritório B')", [escritorioA, escritorioB]);
    await c.query(
      `insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, oab_numero, oab_uf)
       values ($1, $2, 'socio.a@teste.local', 'socio', 'Sócia A', '20817', 'MT'),
              ($1, $3, 'adv.a@teste.local', 'advogado', 'Advogado A', '30000', 'MT'),
              ($1, $4, 'adv2.a@teste.local', 'advogado', 'Advogado A2', '30001', 'MT'),
              ($1, $5, 'est.a@teste.local', 'estagiario', 'Estagiário A', null, null),
              ($1, $6, 'adm.a@teste.local', 'administrativo', 'Administrativo A', null, null),
              ($7, $8, 'socio.b@teste.local', 'socio', 'Sócio B', '40000', 'MT'),
              ($7, $9, 'adv.b@teste.local', 'advogado', 'Advogado B', '40001', 'MT')`,
      [escritorioA, socioA, advogadoA, advogado2A, estagiarioA, adminA, escritorioB, socioB, advogadoB],
    );
    const procs = await c.query(
      `insert into public.processos (escritorio_id, numero_cnj, responsavel_id, segredo_justica)
       values ($1, $2, $3, false), ($1, $4, $3, true), ($5, $6, $7, false)
       returning id, numero_cnj`,
      [escritorioA, cnjA1, advogadoA, cnjA2, escritorioB, cnjB1, advogadoB],
    );
    const porNumero = new Map(procs.rows.map((r) => [r.numero_cnj as string, r.id as string]));
    processoA1 = porNumero.get(cnjA1)!;
    processoA2 = porNumero.get(cnjA2)!;
    processoB1 = porNumero.get(cnjB1)!;
    const ato = await c.query("select id from public.atos_prazo where escritorio_id = $1 and nome = 'Contestação'", [escritorioA]);
    atoContestacaoA = ato.rows[0].id;
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  it("cria os atos padrão de cada escritório ao inserir o escritório", async () => {
    const { rows } = await db.client.query(
      "select escritorio_id, count(*)::int as n, bool_and(dias_seguranca = 2 and fundamento_legal is not null) as ok from public.atos_prazo group by escritorio_id order by escritorio_id",
    );
    expect(rows).toEqual([
      { escritorio_id: escritorioA, n: 10, ok: true },
      { escritorio_id: escritorioB, n: 10, ok: true },
    ]);
    const contestacao = await db.client.query("select dias, contagem::text, fundamento_legal from public.atos_prazo where id = $1", [atoContestacaoA]);
    expect(contestacao.rows[0]).toEqual({ dias: 15, contagem: "dias_uteis", fundamento_legal: "CPC, art. 335" });
  });

  it("publicação inserida pela service role nasce 'nova' com evento (captada) → nova", async () => {
    const id = await inserirPublicacao({ escritorio: escritorioA, idExterno: "evt-1", numeroCnj: cnjA1 });
    const pub = await db.client.query("select status::text, escritorio_id from public.publicacoes where id = $1", [id]);
    expect(pub.rows[0]).toEqual({ status: "nova", escritorio_id: escritorioA });
    const eventos = await db.client.query("select de_status, para_status::text, usuario_id from public.publicacao_eventos where publicacao_id = $1", [id]);
    expect(eventos.rows).toEqual([{ de_status: null, para_status: "nova", usuario_id: null }]);
    // Dedup por (escritorio_id, fonte, id_externo)
    await expect(inserirPublicacao({ escritorio: escritorioA, idExterno: "evt-1" })).rejects.toThrow(/duplicate key/);
  });

  it("estagiário não transiciona; administrativo trata sem_processo → ignorada; transição fora da tabela é recusada", async () => {
    const id = await inserirPublicacao({ escritorio: escritorioA, idExterno: "trans-1", numeroCnj: null });
    await transicaoSistema(id, "classificada", { tipo: "intimacao", resumo_ia: "Intimação para contestar" });
    await transicaoSistema(id, "sem_processo");

    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.transicionar_publicacao($1, 'ignorada', '{\"motivo\": \"x\"}')", [id]))).rejects.toThrow(
      /Estagiário não transiciona/,
    );
    // Ignorar exige motivo
    await expect(db.comoUsuario(comoAdminA, (c) => c.query("select public.transicionar_publicacao($1, 'ignorada')", [id]))).rejects.toThrow(/exige motivo/);
    // Fora da tabela: sem_processo → tratada
    await expect(db.comoUsuario(comoSocioA, (c) => c.query("select public.transicionar_publicacao($1, 'tratada')", [id]))).rejects.toThrow(/não permitida/);

    await db.comoUsuario(comoAdminA, (c) => c.query("select public.transicionar_publicacao($1, 'ignorada', '{\"motivo\": \"homônimo\"}')", [id]));
    const pub = await db.client.query("select status::text, vinculo_tipo::text, motivo_nao_e_nosso, tratada_por, tratada_em, tipo::text, tipo_classificado_por::text, resumo_ia from public.publicacoes where id = $1", [id]);
    expect(pub.rows[0]).toMatchObject({ status: "ignorada", vinculo_tipo: "nao_e_nosso", motivo_nao_e_nosso: "homônimo", tratada_por: adminA, tipo: "intimacao", tipo_classificado_por: "ia", resumo_ia: "Intimação para contestar" });
    expect(pub.rows[0].tratada_em).not.toBeNull();
    const eventos = await db.client.query("select de_status::text, para_status::text, usuario_id from public.publicacao_eventos where publicacao_id = $1 order by criado_em", [id]);
    expect(eventos.rows).toEqual([
      { de_status: null, para_status: "nova", usuario_id: null },
      { de_status: "nova", para_status: "classificada", usuario_id: null },
      { de_status: "classificada", para_status: "sem_processo", usuario_id: null },
      { de_status: "sem_processo", para_status: "ignorada", usuario_id: adminA },
    ]);
  });

  it("administrativo não decide prazo (sem_prazo → tratada); advogado sim; vincular exige processo do escritório", async () => {
    const id = await inserirPublicacao({ escritorio: escritorioA, idExterno: "trans-2", numeroCnj: cnjA1 });
    await transicaoSistema(id, "classificada");
    // Vincular a processo de outro escritório é recusado
    await expect(transicaoSistema(id, "vinculada", { processo_id: processoB1 })).rejects.toThrow(/Processo não encontrado/);
    await transicaoSistema(id, "vinculada", { processo_id: processoA1 });
    await transicaoSistema(id, "sem_prazo", { motivo: "mero expediente" });
    const vinculo = await db.client.query("select processo_id, vinculo_tipo::text, status::text from public.publicacoes where id = $1", [id]);
    expect(vinculo.rows[0]).toEqual({ processo_id: processoA1, vinculo_tipo: "automatico_numero", status: "sem_prazo" });

    await expect(db.comoUsuario(comoAdminA, (c) => c.query("select public.transicionar_publicacao($1, 'tratada')", [id]))).rejects.toThrow(/não permitida/);
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.transicionar_publicacao($1, 'tratada', '{\"motivo\": \"ciente\"}')", [id]));
    const pub = await db.client.query("select status::text, tratada_por, motivo_tratamento from public.publicacoes where id = $1", [id]);
    expect(pub.rows[0]).toEqual({ status: "tratada", tratada_por: advogadoA, motivo_tratamento: "ciente" });

    // Administrativo pode marcar duplicada (qualquer → duplicada), apontando a anterior
    const dup = await inserirPublicacao({ escritorio: escritorioA, idExterno: "trans-2-dup", numeroCnj: cnjA1 });
    await expect(db.comoUsuario(comoAdminA, (c) => c.query("select public.transicionar_publicacao($1, 'duplicada')", [dup]))).rejects.toThrow(/publicacao_anterior_id/);
    await db.comoUsuario(comoAdminA, (c) => c.query("select public.transicionar_publicacao($1, 'duplicada', $2::jsonb)", [dup, JSON.stringify({ publicacao_anterior_id: id })]));
    const dupRow = await db.client.query("select status::text, publicacao_anterior_id from public.publicacoes where id = $1", [dup]);
    expect(dupRow.rows[0]).toEqual({ status: "duplicada", publicacao_anterior_id: id });
  });

  it("texto e payload_bruto não saem por SELECT para usuários; o app lista colunas", async () => {
    await inserirPublicacao({ escritorio: escritorioA, idExterno: "sel-1", numeroCnj: cnjA1 });
    await expect(db.comoUsuario(comoSocioA, (c) => c.query("select * from public.publicacoes"))).rejects.toThrow(/permission denied/);
    await expect(db.comoUsuario(comoSocioA, (c) => c.query("select texto from public.publicacoes"))).rejects.toThrow(/permission denied/);
    await expect(db.comoUsuario(comoSocioA, (c) => c.query("select payload_bruto from public.publicacoes"))).rejects.toThrow(/permission denied/);
    const ok = await db.comoUsuario(comoEstagiarioA, (c) => c.query("select id, status, numero_cnj, resumo_ia, destinatario_advogados from public.publicacoes where id_externo = 'sel-1'"));
    expect(ok.rows).toHaveLength(1);
    // Status não muda por UPDATE direto (sem grant na coluna): só pela RPC
    await expect(db.comoUsuario(comoSocioA, (c) => c.query("update public.publicacoes set status = 'arquivada' where id_externo = 'sel-1'"))).rejects.toThrow(/permission denied/);
  });

  it("advogado lê o texto pela RPC e isso gera auditoria; auditoria só o sócio vê", async () => {
    const id = await inserirPublicacao({ escritorio: escritorioA, idExterno: "txt-1", numeroCnj: cnjA1, texto: "Fica o réu intimado a contestar em 15 dias." });
    await transicaoSistema(id, "classificada");
    await transicaoSistema(id, "vinculada", { processo_id: processoA1 });

    const texto = await db.comoUsuario(comoAdvogadoA, async (c) => (await c.query("select public.publicacao_texto($1) as t", [id])).rows[0].t);
    expect(texto).toBe("Fica o réu intimado a contestar em 15 dias.");
    // Processo comum: estagiário e administrativo também leem
    const textoEst = await db.comoUsuario(comoEstagiarioA, async (c) => (await c.query("select public.publicacao_texto($1) as t", [id])).rows[0].t);
    expect(textoEst).toBe("Fica o réu intimado a contestar em 15 dias.");
    await db.comoUsuario(comoAdminA, (c) => c.query("select public.publicacao_texto($1)", [id]));

    const auditoria = await db.client.query(
      "select usuario_id, objeto_tipo, acao::text, contexto from public.auditoria_acessos where objeto_id = $1 and escritorio_id = $2 order by criado_em",
      [id, escritorioA],
    );
    expect(auditoria.rows.map((r) => r.usuario_id)).toEqual([advogadoA, estagiarioA, adminA]);
    expect(auditoria.rows[0]).toMatchObject({ objeto_tipo: "publicacao", acao: "visualizou_texto", contexto: { processo_id: processoA1, sigiloso: false, papel: "advogado" } });

    const vistoPorSocio = await db.comoUsuario(comoSocioA, async (c) => (await c.query("select count(*)::int as n from public.auditoria_acessos")).rows[0].n);
    expect(vistoPorSocio).toBeGreaterThanOrEqual(3);
    const vistoPorAdvogado = await db.comoUsuario(comoAdvogadoA, async (c) => (await c.query("select count(*)::int as n from public.auditoria_acessos")).rows[0].n);
    expect(vistoPorAdvogado).toBe(0);
    // Ninguém insere auditoria direto
    await expect(
      db.comoUsuario(comoSocioA, (c) => c.query("insert into public.auditoria_acessos (escritorio_id, usuario_id, objeto_tipo, acao) values ($1, $2, 'x', 'exportou')", [escritorioA, socioA])),
    ).rejects.toThrow(/permission denied/);
  });

  it("texto de processo sigiloso: só sócio e advogado responsável/colaborador; estagiário e administrativo não", async () => {
    const id = await inserirPublicacao({ escritorio: escritorioA, idExterno: "sig-1", numeroCnj: cnjA2, texto: "Conteúdo sob segredo de justiça." });
    await transicaoSistema(id, "classificada");
    await transicaoSistema(id, "vinculada", { processo_id: processoA2 });

    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.publicacao_texto($1)", [id]))).rejects.toThrow(/sigiloso/);
    await expect(db.comoUsuario(comoAdminA, (c) => c.query("select public.publicacao_texto($1)", [id]))).rejects.toThrow(/sigiloso/);
    await expect(db.comoUsuario(comoAdvogado2A, (c) => c.query("select public.publicacao_texto($1)", [id]))).rejects.toThrow(/sigiloso/);
    const pelaResponsavel = await db.comoUsuario(comoAdvogadoA, async (c) => (await c.query("select public.publicacao_texto($1) as t", [id])).rows[0].t);
    expect(pelaResponsavel).toBe("Conteúdo sob segredo de justiça.");
    const peloSocio = await db.comoUsuario(comoSocioA, async (c) => (await c.query("select public.publicacao_texto($1) as t", [id])).rows[0].t);
    expect(peloSocio).toBe("Conteúdo sob segredo de justiça.");

    // Colaborador passa a ler
    await db.client.query("insert into public.processo_colaboradores (escritorio_id, processo_id, usuario_id) values ($1, $2, $3)", [escritorioA, processoA2, advogado2A]);
    const peloColaborador = await db.comoUsuario(comoAdvogado2A, async (c) => (await c.query("select public.publicacao_texto($1) as t", [id])).rows[0].t);
    expect(peloColaborador).toBe("Conteúdo sob segredo de justiça.");

    const auditoria = await db.client.query("select usuario_id, contexto -> 'sigiloso' as sigiloso from public.auditoria_acessos where objeto_id = $1 order by criado_em", [id]);
    expect(auditoria.rows).toEqual([
      { usuario_id: advogadoA, sigiloso: true },
      { usuario_id: socioA, sigiloso: true },
      { usuario_id: advogado2A, sigiloso: true },
    ]);
    // Tentativas negadas não geram leitura
    expect(auditoria.rows.map((r) => r.usuario_id)).not.toContain(estagiarioA);
  });

  it("prazo sugerido → confirmado só pelo advogado responsável (ou sócio); a confirmação cria a tarefa 'protocolar'", async () => {
    const pub = await inserirPublicacao({ escritorio: escritorioA, idExterno: "prz-1", numeroCnj: cnjA1 });
    await transicaoSistema(pub, "classificada");
    await transicaoSistema(pub, "vinculada", { processo_id: processoA1 });
    await transicaoSistema(pub, "com_prazo_sugerido");
    const prazo = await inserirPrazo({ processo: processoA1, publicacao: pub, dataFinal: "2026-03-30", dataInterna: "2026-03-26", ato: atoContestacaoA });

    const criado = await db.client.query("select tipo, de_status, para_status::text from public.prazos_eventos where prazo_id = $1", [prazo]);
    expect(criado.rows).toEqual([{ tipo: "criado", de_status: null, para_status: "sugerido" }]);

    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.confirmar_prazo($1)", [prazo]))).rejects.toThrow(/Apenas o advogado responsável/);
    await expect(db.comoUsuario(comoAdminA, (c) => c.query("select public.confirmar_prazo($1)", [prazo]))).rejects.toThrow(/Apenas o advogado responsável/);
    await expect(db.comoUsuario(comoAdvogado2A, (c) => c.query("select public.confirmar_prazo($1)", [prazo]))).rejects.toThrow(/Apenas o advogado responsável/);
    const antes = await db.client.query("select count(*)::int as n from public.tarefas where prazo_id = $1", [prazo]);
    expect(antes.rows[0].n).toBe(0);

    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.confirmar_prazo($1, p_observacao => 'ok')", [prazo]));
    const confirmado = await db.client.query(
      "select status::text, data_final::text, data_interna::text, data_confirmada::text, data_sugerida_ia::text, confirmado_por, confirmado_em from public.prazos where id = $1",
      [prazo],
    );
    expect(confirmado.rows[0]).toMatchObject({ status: "confirmado", data_final: "2026-03-30", data_interna: "2026-03-26", data_confirmada: "2026-03-30", data_sugerida_ia: "2026-03-30", confirmado_por: advogadoA });
    expect(confirmado.rows[0].confirmado_em).not.toBeNull();

    const tarefas = await db.client.query(
      "select titulo, tipo::text, origem::text, status::text, vencimento::text, responsavel_id, executor_id, processo_id, publicacao_id, criado_por_tipo from public.tarefas where prazo_id = $1",
      [prazo],
    );
    expect(tarefas.rows).toHaveLength(1);
    expect(tarefas.rows[0]).toEqual({
      titulo: `Contestação — ${cnjA1.slice(0, 7)}-${cnjA1.slice(7, 9)}.2025.8.11.0041`,
      tipo: "protocolar",
      origem: "prazo",
      status: "a_fazer",
      vencimento: "2026-03-26",
      responsavel_id: advogadoA,
      executor_id: advogadoA,
      processo_id: processoA1,
      publicacao_id: pub,
      criado_por_tipo: "sistema",
    });
    const eventoTarefa = await db.client.query("select e.tipo::text, e.usuario_id from public.tarefa_eventos e join public.tarefas t on t.id = e.tarefa_id where t.prazo_id = $1", [prazo]);
    expect(eventoTarefa.rows).toEqual([{ tipo: "criada", usuario_id: advogadoA }]);

    // Único prazo da publicação decidido → publicação 'tratada' pelo sistema
    const pubRow = await db.client.query("select status::text from public.publicacoes where id = $1", [pub]);
    expect(pubRow.rows[0].status).toBe("tratada");

    // Confirmar de novo não é transição válida
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.confirmar_prazo($1)", [prazo]))).rejects.toThrow(/não permitida/);
  });

  it("confirmar com outra data guarda a sugerida e recalcula a data interna em dias úteis", async () => {
    const prazo = await inserirPrazo({ processo: processoA1, dataFinal: "2026-03-30", dataInterna: "2026-03-26", ato: atoContestacaoA });
    // 06/04/2026 (segunda): recua 2 dias úteis pulando fim de semana e Sexta-feira Santa (03/04) → 01/04
    await db.comoUsuario(comoSocioA, (c) => c.query("select public.confirmar_prazo($1, '2026-04-06', null, 2)", [prazo]));
    const r = await db.client.query("select status::text, data_final::text, data_interna::text, data_sugerida_ia::text, multiplicador, confirmado_por from public.prazos where id = $1", [prazo]);
    expect(r.rows[0]).toEqual({ status: "confirmado", data_final: "2026-04-06", data_interna: "2026-04-01", data_sugerida_ia: "2026-03-30", multiplicador: 2, confirmado_por: socioA });
    const tarefa = await db.client.query("select vencimento::text from public.tarefas where prazo_id = $1", [prazo]);
    expect(tarefa.rows[0].vencimento).toBe("2026-04-01");
  });

  it("calendário incompleto exige reconhecimento explícito", async () => {
    const prazo = await inserirPrazo({ processo: processoA1, dataFinal: "2027-02-08", dataInterna: "2027-02-04", calendarioIncompleto: true, ato: atoContestacaoA });
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.confirmar_prazo($1)", [prazo]))).rejects.toThrow(/calendário incompleto/);
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.confirmar_prazo($1, p_reconhecer_calendario => false)", [prazo]))).rejects.toThrow(/calendário incompleto/);
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.confirmar_prazo($1, p_reconhecer_calendario => true)", [prazo]));
    const r = await db.client.query("select status::text, calendario_reconhecido_por from public.prazos where id = $1", [prazo]);
    expect(r.rows[0]).toEqual({ status: "confirmado", calendario_reconhecido_por: advogadoA });
    const evento = await db.client.query("select dados -> 'reconheceu_calendario' as rec from public.prazos_eventos where prazo_id = $1 and tipo = 'confirmado'", [prazo]);
    expect(evento.rows[0].rec).toBe(true);
  });

  it("nenhum UPDATE direto em prazos; lançamento manual só por advogado/sócio e sempre em 'sugerido'", async () => {
    const prazo = await inserirPrazo({ processo: processoA1, dataFinal: "2026-05-04" });
    await expect(db.comoUsuario(comoSocioA, (c) => c.query("update public.prazos set status = 'confirmado' where id = $1", [prazo]))).rejects.toThrow(/permission denied/);
    await expect(db.comoUsuario(comoSocioA, (c) => c.query("delete from public.prazos where id = $1", [prazo]))).rejects.toThrow(/permission denied/);

    const manual = (claims: Record<string, unknown>, status: string) =>
      db.comoUsuario(claims, (c) =>
        c.query("insert into public.prazos (escritorio_id, processo_id, origem, ato_descricao, data_final, status, responsavel_id) values ($1, $2, 'manual', 'Manifestação', '2026-05-11', $3, $4) returning id", [
          escritorioA,
          processoA1,
          status,
          advogadoA,
        ]),
      );
    await expect(manual(comoEstagiarioA, "sugerido")).rejects.toThrow(/row-level security/);
    await expect(manual(comoAdminA, "sugerido")).rejects.toThrow(/row-level security/);
    await expect(manual(comoAdvogadoA, "confirmado")).rejects.toThrow(/row-level security/);
    const r = await manual(comoAdvogadoA, "sugerido");
    expect(r.rows).toHaveLength(1);
  });

  it("rejeitar exige motivo; suspender/prorrogar move a data e o vencimento da tarefa; cancelar cancela a tarefa", async () => {
    const rejeitavel = await inserirPrazo({ processo: processoA1, dataFinal: "2026-06-01" });
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.rejeitar_prazo($1, '')", [rejeitavel]))).rejects.toThrow(/exige motivo/);
    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.rejeitar_prazo($1, 'x')", [rejeitavel]))).rejects.toThrow(/Apenas o advogado responsável/);
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.rejeitar_prazo($1, 'intimação de terceiro')", [rejeitavel]));
    const rej = await db.client.query("select status::text, motivo_rejeicao from public.prazos where id = $1", [rejeitavel]);
    expect(rej.rows[0]).toEqual({ status: "rejeitado", motivo_rejeicao: "intimação de terceiro" });
    const semTarefa = await db.client.query("select count(*)::int as n from public.tarefas where prazo_id = $1", [rejeitavel]);
    expect(semTarefa.rows[0].n).toBe(0);

    const prazo = await inserirPrazo({ processo: processoA1, dataFinal: "2026-06-01", dataInterna: "2026-05-28", ato: atoContestacaoA });
    // Suspender um sugerido não é permitido
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.suspender_ou_prorrogar_prazo($1, 'suspenso', null, 'decisão')", [prazo]))).rejects.toThrow(/não permitida/);
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.confirmar_prazo($1)", [prazo]));
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.suspender_ou_prorrogar_prazo($1, 'prorrogado', '2026-06-15', null)", [prazo]))).rejects.toThrow(/exige fundamento/);
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.suspender_ou_prorrogar_prazo($1, 'prorrogado', null, 'decisão')", [prazo]))).rejects.toThrow(/nova data/);
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.suspender_ou_prorrogar_prazo($1, 'prorrogado', '2026-06-15', 'Decisão de 20/05/2026')", [prazo]));
    // 15/06/2026 (segunda) menos 2 dias úteis = 11/06 (quinta); Corpus Christi forense é 04/06, fora do intervalo
    const pror = await db.client.query("select status::text, data_final::text, data_interna::text from public.prazos where id = $1", [prazo]);
    expect(pror.rows[0]).toEqual({ status: "prorrogado", data_final: "2026-06-15", data_interna: "2026-06-11" });
    const tarefa = await db.client.query("select id, vencimento::text, status::text from public.tarefas where prazo_id = $1", [prazo]);
    expect(tarefa.rows).toHaveLength(1);
    expect(tarefa.rows[0].vencimento).toBe("2026-06-11");
    const eventosTarefa = await db.client.query("select tipo::text, dados from public.tarefa_eventos where tarefa_id = $1 order by criado_em", [tarefa.rows[0].id]);
    expect(eventosTarefa.rows.map((r) => r.tipo)).toEqual(["criada", "vencimento_alterado"]);
    expect(eventosTarefa.rows[1].dados).toEqual({ de: "2026-05-28", para: "2026-06-11" });

    // Retomada: prorrogado → confirmado; depois cancelar com motivo cancela a tarefa aberta
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.confirmar_prazo($1)", [prazo]));
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.cancelar_prazo($1, null)", [prazo]))).rejects.toThrow(/exige motivo/);
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.cancelar_prazo($1, 'processo encerrado')", [prazo]));
    const canc = await db.client.query("select p.status::text as prazo, p.motivo_cancelamento, t.status::text as tarefa, t.cancelada_motivo from public.prazos p join public.tarefas t on t.prazo_id = p.id where p.id = $1", [prazo]);
    expect(canc.rows[0]).toEqual({ prazo: "cancelado", motivo_cancelamento: "processo encerrado", tarefa: "cancelada", cancelada_motivo: "Prazo cancelado: processo encerrado" });
    const soUmaTarefa = await db.client.query("select count(*)::int as n from public.tarefas where prazo_id = $1", [prazo]);
    expect(soUmaTarefa.rows[0].n).toBe(1);
  });

  it("marcar_prazos_vencidos é só do sistema e devolve a quantidade; as views atrasadas/críticas enxergam", async () => {
    const prazo = await inserirPrazo({ processo: processoA1, dataFinal: "2026-02-27", dataInterna: "2026-02-25", ato: atoContestacaoA });
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.confirmar_prazo($1)", [prazo]));

    await expect(db.comoUsuario(comoSocioA, (c) => c.query("select public.marcar_prazos_vencidos('2026-03-01')"))).rejects.toThrow(/permission denied|Apenas o sistema/);

    const nenhum = await comoServiceRole(async (c) => (await c.query("select public.marcar_prazos_vencidos('2026-02-27') as n")).rows[0].n);
    expect(nenhum).toBe(0);
    const n = await comoServiceRole(async (c) => (await c.query("select public.marcar_prazos_vencidos('2026-02-28') as n")).rows[0].n);
    expect(n).toBe(1);
    const r = await db.client.query("select status::text from public.prazos where id = $1", [prazo]);
    expect(r.rows[0].status).toBe("vencido");
    const evento = await db.client.query("select tipo, de_status::text, para_status::text, usuario_id from public.prazos_eventos where prazo_id = $1 and tipo = 'vencido'", [prazo]);
    expect(evento.rows).toEqual([{ tipo: "vencido", de_status: "confirmado", para_status: "vencido", usuario_id: null }]);

    const tarefaId = (await db.client.query("select id from public.tarefas where prazo_id = $1", [prazo])).rows[0].id as string;
    const views = await db.comoUsuario(comoAdvogadoA, async (c) => ({
      atrasadas: (await c.query("select id from public.tarefas_atrasadas")).rows.map((x) => x.id),
      criticas: (await c.query("select id, prazo_status::text from public.tarefas_criticas")).rows,
    }));
    expect(views.atrasadas).toContain(tarefaId);
    expect(views.criticas.map((x) => x.id)).toContain(tarefaId);
    // Sócio de B não vê nada nas views
    const viewsB = await db.comoUsuario(comoSocioB, async (c) => (await c.query("select count(*)::int as n from public.tarefas_atrasadas")).rows[0].n);
    expect(viewsB).toBe(0);
  });

  it("estagiário chega só a pronta_para_revisao; concluir com protocolado cumpre o prazo com evidência 'tarefa'", async () => {
    const prazo = await inserirPrazo({ processo: processoA1, dataFinal: "2026-07-06", dataInterna: "2026-07-02", ato: atoContestacaoA });
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.confirmar_prazo($1)", [prazo]));
    const tarefa = (await db.client.query("select id from public.tarefas where prazo_id = $1", [prazo])).rows[0].id as string;

    // Estagiário não reatribui; o responsável reatribui para o estagiário com evento de/para
    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.reatribuir_tarefa($1, $2)", [tarefa, estagiarioA]))).rejects.toThrow(/Estagiário não reatribui/);
    await expect(db.comoUsuario(comoAdvogado2A, (c) => c.query("select public.reatribuir_tarefa($1, $2)", [tarefa, estagiarioA]))).rejects.toThrow(/Apenas o responsável/);
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.reatribuir_tarefa($1, $2)", [tarefa, socioB]))).rejects.toThrow(/membro ativo/);
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.reatribuir_tarefa($1, $2, 'distribuição da semana')", [tarefa, estagiarioA]));
    const reat = await db.client.query("select de_usuario_id, para_usuario_id, usuario_id, dados ->> 'motivo' as motivo from public.tarefa_eventos where tarefa_id = $1 and tipo = 'reatribuida'", [tarefa]);
    expect(reat.rows).toEqual([{ de_usuario_id: advogadoA, para_usuario_id: estagiarioA, usuario_id: advogadoA, motivo: "distribuição da semana" }]);

    // Estagiário (executor) avança até pronta_para_revisao, mas não conclui
    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.alterar_status_tarefa($1, 'pronta_para_revisao')", [tarefa]))).rejects.toThrow(/não permitida/);
    await db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.alterar_status_tarefa($1, 'em_andamento')", [tarefa]));
    await db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.alterar_status_tarefa($1, 'pronta_para_revisao')", [tarefa]));
    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.alterar_status_tarefa($1, 'concluida')", [tarefa]))).rejects.toThrow(/Estagiário não conclui/);
    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.concluir_tarefa($1, true)", [tarefa]))).rejects.toThrow(/Estagiário não conclui/);
    // Administrativo não conclui tarefa ligada a prazo
    await expect(db.comoUsuario(comoAdminA, (c) => c.query("select public.concluir_tarefa($1, true)", [tarefa]))).rejects.toThrow(/Apenas advogado ou sócio/);
    // Advogado sem vínculo com o processo conclui a tarefa? Com protocolado, precisa poder agir no prazo
    await expect(db.comoUsuario(comoAdvogado2A, (c) => c.query("select public.concluir_tarefa($1, true)", [tarefa]))).rejects.toThrow(/Apenas o advogado responsável/);
    const aindaAberta = await db.client.query("select status::text from public.tarefas where id = $1", [tarefa]);
    expect(aindaAberta.rows[0].status).toBe("pronta_para_revisao");

    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.concluir_tarefa($1, true)", [tarefa]));
    const t = await db.client.query("select status::text, concluida_por, concluida_em from public.tarefas where id = $1", [tarefa]);
    expect(t.rows[0]).toMatchObject({ status: "concluida", concluida_por: advogadoA });
    expect(t.rows[0].concluida_em).not.toBeNull();
    const p = await db.client.query("select status::text, cumprimento_evidencia::text, cumprido_por, cumprido_em from public.prazos where id = $1", [prazo]);
    expect(p.rows[0]).toMatchObject({ status: "cumprido", cumprimento_evidencia: "tarefa", cumprido_por: advogadoA });
    expect(p.rows[0].cumprido_em).not.toBeNull();
    const statusEventos = await db.client.query("select dados ->> 'de' as de, dados ->> 'para' as para from public.tarefa_eventos where tarefa_id = $1 and tipo = 'status_alterado' order by criado_em", [tarefa]);
    expect(statusEventos.rows).toEqual([
      { de: "a_fazer", para: "em_andamento" },
      { de: "em_andamento", para: "pronta_para_revisao" },
      { de: "pronta_para_revisao", para: "concluida" },
    ]);

    // Concluir sem protocolado não mexe no prazo
    const prazo2 = await inserirPrazo({ processo: processoA1, dataFinal: "2026-07-13", dataInterna: "2026-07-09" });
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.confirmar_prazo($1)", [prazo2]));
    const tarefa2 = (await db.client.query("select id from public.tarefas where prazo_id = $1", [prazo2])).rows[0].id as string;
    await db.comoUsuario(comoSocioA, (c) => c.query("select public.concluir_tarefa($1, false)", [tarefa2]));
    const p2 = await db.client.query("select status::text from public.prazos where id = $1", [prazo2]);
    expect(p2.rows[0].status).toBe("confirmado");
  });

  it("criar tarefa: estagiário só para si; administrativo conclui só tarefa administrativa sem prazo", async () => {
    await expect(
      db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.criar_tarefa('Pesquisar jurisprudência', 'redigir', $1, p_executor_id => $2)", [processoA1, advogadoA])),
    ).rejects.toThrow(/só cria tarefa para si/);
    const propria = await db.comoUsuario(comoEstagiarioA, async (c) => (await c.query("select public.criar_tarefa('Pesquisar jurisprudência', 'redigir', $1) as id", [processoA1])).rows[0].id as string);
    const t = await db.client.query("select executor_id, responsavel_id, criado_por_id, status::text, origem::text from public.tarefas where id = $1", [propria]);
    expect(t.rows[0]).toEqual({ executor_id: estagiarioA, responsavel_id: advogadoA, criado_por_id: estagiarioA, status: "a_fazer", origem: "manual" });
    // Inserção direta pela policy: estagiário para outro é recusado; para si, aceito
    await expect(
      db.comoUsuario(comoEstagiarioA, (c) => c.query("insert into public.tarefas (escritorio_id, titulo, executor_id) values ($1, 'x', $2)", [escritorioA, advogadoA])),
    ).rejects.toThrow(/row-level security/);
    await db.comoUsuario(comoEstagiarioA, (c) => c.query("insert into public.tarefas (escritorio_id, titulo, executor_id) values ($1, 'minha', $2)", [escritorioA, estagiarioA]));
    // Status não muda por UPDATE direto (coluna sem grant)
    await expect(db.comoUsuario(comoSocioA, (c) => c.query("update public.tarefas set status = 'concluida' where id = $1", [propria]))).rejects.toThrow(/permission denied/);

    const administrativa = await db.comoUsuario(comoAdminA, async (c) => (await c.query("select public.criar_tarefa('Ligar para o cliente', 'contato_cliente') as id")).rows[0].id as string);
    await db.comoUsuario(comoAdminA, (c) => c.query("select public.concluir_tarefa($1)", [administrativa]));
    const adm = await db.client.query("select status::text, concluida_por from public.tarefas where id = $1", [administrativa]);
    expect(adm.rows[0]).toEqual({ status: "concluida", concluida_por: adminA });
    // Mas não conclui tarefa jurídica (redigir)
    await expect(db.comoUsuario(comoAdminA, (c) => c.query("select public.concluir_tarefa($1)", [propria]))).rejects.toThrow(/Apenas advogado ou sócio/);
    // Cancelar exige motivo e papel
    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.cancelar_tarefa($1, 'x')", [propria]))).rejects.toThrow(/Apenas advogado ou sócio/);
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.cancelar_tarefa($1, 'não é mais necessária')", [propria]));
    const canc = await db.client.query("select status::text, cancelada_motivo from public.tarefas where id = $1", [propria]);
    expect(canc.rows[0]).toEqual({ status: "cancelada", cancelada_motivo: "não é mais necessária" });
  });

  it("isola escritórios em publicacoes, prazos e tarefas (SELECT e RPCs)", async () => {
    const pubB = await inserirPublicacao({ escritorio: escritorioB, idExterno: "b-1", numeroCnj: cnjB1, texto: "Texto de B" });
    const prazoB = await inserirPrazo({ processo: processoB1, dataFinal: "2026-08-03", dataInterna: "2026-07-30" });
    await db.comoUsuario({ sub: advogadoB, escritorio_id: escritorioB, papel: "advogado" }, (c) => c.query("select public.confirmar_prazo($1)", [prazoB]));

    const vistoPorB = await db.comoUsuario(comoSocioB, async (c) => ({
      publicacoes: (await c.query("select id from public.publicacoes")).rows.map((r) => r.id),
      prazos: (await c.query("select id from public.prazos")).rows.map((r) => r.id),
      tarefas: (await c.query("select prazo_id from public.tarefas")).rows.map((r) => r.prazo_id),
      eventos: (await c.query("select count(*)::int as n from public.publicacao_eventos e where e.escritorio_id <> $1", [escritorioB])).rows[0].n,
      atos: (await c.query("select count(*)::int as n from public.atos_prazo")).rows[0].n,
    }));
    expect(vistoPorB.publicacoes).toEqual([pubB]);
    expect(vistoPorB.prazos).toEqual([prazoB]);
    expect(vistoPorB.tarefas).toEqual([prazoB]);
    expect(vistoPorB.eventos).toBe(0);
    expect(vistoPorB.atos).toBe(10);

    const vistoPorA = await db.comoUsuario(comoSocioA, async (c) => ({
      publicacoesDeB: (await c.query("select count(*)::int as n from public.publicacoes where escritorio_id = $1", [escritorioB])).rows[0].n,
      prazosDeB: (await c.query("select count(*)::int as n from public.prazos where escritorio_id = $1", [escritorioB])).rows[0].n,
      tarefasDeB: (await c.query("select count(*)::int as n from public.tarefas where escritorio_id = $1", [escritorioB])).rows[0].n,
    }));
    expect(vistoPorA).toEqual({ publicacoesDeB: 0, prazosDeB: 0, tarefasDeB: 0 });

    // RPCs: sócio de A não alcança objetos de B (nem lendo, nem transicionando)
    const tarefaB = (await db.client.query("select id from public.tarefas where prazo_id = $1", [prazoB])).rows[0].id as string;
    await expect(db.comoUsuario(comoSocioA, (c) => c.query("select public.publicacao_texto($1)", [pubB]))).rejects.toThrow(/não encontrada/);
    await expect(db.comoUsuario(comoSocioA, (c) => c.query("select public.transicionar_publicacao($1, 'classificada')", [pubB]))).rejects.toThrow(/não encontrada/);
    await expect(db.comoUsuario(comoSocioA, (c) => c.query("select public.cumprir_prazo($1)", [prazoB]))).rejects.toThrow(/não encontrado/);
    await expect(db.comoUsuario(comoSocioA, (c) => c.query("select public.cancelar_prazo($1, 'x')", [prazoB]))).rejects.toThrow(/não encontrado/);
    await expect(db.comoUsuario(comoSocioA, (c) => c.query("select public.concluir_tarefa($1, true)", [tarefaB]))).rejects.toThrow(/não encontrada/);
    await expect(db.comoUsuario(comoSocioA, (c) => c.query("select public.reatribuir_tarefa($1, $2)", [tarefaB, socioA]))).rejects.toThrow(/não encontrada/);
    // Inserir prazo/tarefa/publicação com escritorio_id de B é recusado pela RLS
    await expect(
      db.comoUsuario(comoSocioA, (c) => c.query("insert into public.prazos (escritorio_id, processo_id, data_final) values ($1, $2, '2026-09-01')", [escritorioB, processoB1])),
    ).rejects.toThrow(/row-level security/);
    await expect(db.comoUsuario(comoSocioA, (c) => c.query("insert into public.tarefas (escritorio_id, titulo) values ($1, 'x')", [escritorioB]))).rejects.toThrow(/row-level security/);
    await expect(
      db.comoUsuario(comoSocioA, (c) => c.query("insert into public.publicacoes (escritorio_id, fonte, texto) values ($1, 'pje_manual', 'x')", [escritorioB])),
    ).rejects.toThrow(/row-level security/);
    // Lançamento manual no próprio escritório funciona (sócio, advogado, administrativo), mas não para estagiário nem como 'djen'
    await db.comoUsuario(comoAdminA, (c) => c.query("insert into public.publicacoes (escritorio_id, fonte, texto, numero_processo_texto) values ($1, 'pje_manual', 'Intimação vista no PJe', $2)", [escritorioA, cnjA1]));
    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("insert into public.publicacoes (escritorio_id, fonte, texto) values ($1, 'pje_manual', 'x')", [escritorioA]))).rejects.toThrow(/row-level security/);
    await expect(db.comoUsuario(comoAdminA, (c) => c.query("insert into public.publicacoes (escritorio_id, fonte, texto) values ($1, 'djen', 'x')", [escritorioA]))).rejects.toThrow(/row-level security/);
  });
});
