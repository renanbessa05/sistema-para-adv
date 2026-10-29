import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { montarCnj } from "../../src/lib/cnj/numero-cnj";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Migration 0016 (MFA obrigatório para sócio e advogado), contra docs/regras/permissoes.md "Segundo fator":
 * a) sócio com fator verificado e sessão aal1 não vê prazos nem decide (RPCs levantam 42501);
 * b) o mesmo sócio com aal2 vê e decide;
 * c) sócio sem fator cadastrado (ou só com fator pendente) e aal1 vê: carência para cadastrar o primeiro;
 * d) estagiário e administrativo em aal1 veem: o papel não exige;
 * e) service role e conexão direta (jobs) ignoram a regra;
 * f) escritorio_membros e escritorios continuam legíveis em aal1 (layout e tela de cadastro).
 */
describe("MFA obrigatório para sócio e advogado", () => {
  let db: BancoDeTeste;
  const escritorio = "33333333-3333-4333-8333-333333333333";
  const socioComFator = "cafecafe-cafe-4afe-8afe-cafecafecafe";
  const socioSemFator = "cbcbcbcb-cbcb-4bcb-8bcb-cbcbcbcbcbcb";
  const socioPendente = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd";
  const advogado = "cececece-cece-4ece-8ece-cececececece";
  const estagiario = "cfcfcfcf-cfcf-4fcf-8fcf-cfcfcfcfcfcf";
  const administrativo = "dadadada-dada-4ada-8ada-dadadadadada";

  const claims = (sub: string, papel: string, aal?: string) => ({ sub, escritorio_id: escritorio, papel, ...(aal ? { aal } : {}) });

  const cnj = montarCnj(300, 2025, 8, "11", "0041");
  let processo: string;
  let prazo: string;
  let publicacao: string;

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

  const contarPrazos = (c: Client) => c.query("select count(*)::int as n from public.prazos").then((r) => r.rows[0].n as number);

  beforeAll(async () => {
    db = await subirBancoDeTeste();
    const c = db.client;
    for (const [id, email] of [
      [socioComFator, "socio.fator@teste.local"],
      [socioSemFator, "socio.semfator@teste.local"],
      [socioPendente, "socio.pendente@teste.local"],
      [advogado, "adv@teste.local"],
      [estagiario, "est@teste.local"],
      [administrativo, "adm@teste.local"],
    ]) {
      await c.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
    }
    await c.query("insert into public.escritorios (id, nome) values ($1, 'Escritório MFA')", [escritorio]);
    await c.query(
      `insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, oab_numero, oab_uf)
       values ($1, $2, 'socio.fator@teste.local', 'socio', 'Sócia com fator', '50000', 'MT'),
              ($1, $3, 'socio.semfator@teste.local', 'socio', 'Sócio sem fator', '50001', 'MT'),
              ($1, $4, 'socio.pendente@teste.local', 'socio', 'Sócio com fator pendente', '50002', 'MT'),
              ($1, $5, 'adv@teste.local', 'advogado', 'Advogado', '50003', 'MT'),
              ($1, $6, 'est@teste.local', 'estagiario', 'Estagiário', null, null),
              ($1, $7, 'adm@teste.local', 'administrativo', 'Administrativo', null, null)`,
      [escritorio, socioComFator, socioSemFator, socioPendente, advogado, estagiario, administrativo],
    );
    // Fatores como o Supabase Auth os grava: um verificado para a sócia; um só iniciado (QR gerado, nunca confirmado) para o outro sócio
    await c.query("insert into auth.mfa_factors (user_id, factor_type, status, friendly_name) values ($1, 'totp', 'verified', 'Celular'), ($2, 'totp', 'unverified', 'Rascunho')", [
      socioComFator,
      socioPendente,
    ]);

    const proc = await c.query("insert into public.processos (escritorio_id, numero_cnj, responsavel_id, segredo_justica) values ($1, $2, $3, false) returning id", [escritorio, cnj, advogado]);
    processo = proc.rows[0].id;

    publicacao = await comoServiceRole(async (sr) => {
      const r = await sr.query(
        `insert into public.publicacoes (escritorio_id, fonte, id_externo, hash_dedup, numero_cnj, texto, payload_bruto, data_disponibilizacao, destinatario_advogados)
         values ($1, 'djen', 'mfa-1', md5('mfa-1'), $2, 'Texto da publicação', '{"id": 1}'::jsonb, '2026-03-06', '[]'::jsonb)
         returning id`,
        [escritorio, cnj],
      );
      return r.rows[0].id as string;
    });
    prazo = await comoServiceRole(async (sr) => {
      const r = await sr.query(
        `insert into public.prazos (escritorio_id, processo_id, publicacao_id, origem, ato_descricao, quantidade, data_disponibilizacao, data_publicacao,
                                    data_inicio_contagem, data_final, data_sugerida_ia, memoria_calculo, calendario_incompleto, responsavel_id)
         values ($1, $2, $3, 'publicacao_djen', 'Contestação', 15, '2026-03-06', '2026-03-09', '2026-03-10', '2026-03-31', '2026-03-31', '{"regra": "teste"}'::jsonb, false, $4)
         returning id`,
        [escritorio, processo, publicacao, advogado],
      );
      return r.rows[0].id as string;
    });
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  it("app.mfa_satisfeita responde por papel, claim aal e fator cadastrado", async () => {
    const avaliar = (cl: Record<string, unknown>) => db.comoUsuario(cl, (c) => c.query("select app.mfa_satisfeita() as ok").then((r) => r.rows[0].ok as boolean));
    expect(await avaliar(claims(socioComFator, "socio", "aal1"))).toBe(false);
    expect(await avaliar(claims(socioComFator, "socio"))).toBe(false); // sem claim aal = aal1
    expect(await avaliar(claims(socioComFator, "socio", "aal2"))).toBe(true);
    expect(await avaliar(claims(socioComFator, "advogado", "aal1"))).toBe(false);
    expect(await avaliar(claims(socioSemFator, "socio", "aal1"))).toBe(true);
    expect(await avaliar(claims(socioPendente, "socio", "aal1"))).toBe(true); // fator não verificado não conta
    expect(await avaliar(claims(socioComFator, "estagiario", "aal1"))).toBe(true);
    expect(await avaliar(claims(socioComFator, "administrativo", "aal1"))).toBe(true);
  });

  it("(a) sócio com fator verificado em aal1 não vê prazos, publicações, processos nem tarefas", async () => {
    const cl = claims(socioComFator, "socio", "aal1");
    const n = await db.comoUsuario(cl, async (c) => {
      const tabelas = ["prazos", "publicacoes", "processos", "clientes", "tarefas", "aprovacoes", "notificacoes", "prazos_eventos", "publicacao_eventos"];
      const contagens: Record<string, number> = {};
      for (const t of tabelas) contagens[t] = (await c.query(`select count(*)::int as n from public.${t}`)).rows[0].n;
      return contagens;
    });
    expect(n.prazos).toBe(0);
    expect(n.publicacoes).toBe(0);
    expect(n.processos).toBe(0);
    expect(n.prazos_eventos).toBe(0);
    expect(n.publicacao_eventos).toBe(0);
    expect(Object.values(n).every((v) => v === 0)).toBe(true);
  });

  it("(a) sócio com fator verificado em aal1 não decide: confirmar_prazo e transicionar_publicacao levantam 42501", async () => {
    const cl = claims(socioComFator, "socio", "aal1");
    await expect(db.comoUsuario(cl, (c) => c.query("select public.confirmar_prazo($1)", [prazo]))).rejects.toMatchObject({ code: "42501", message: "Segundo fator obrigatório" });
    await expect(db.comoUsuario(cl, (c) => c.query("select public.transicionar_publicacao($1, 'classificada', '{}'::jsonb)", [publicacao]))).rejects.toMatchObject({
      code: "42501",
      message: "Segundo fator obrigatório",
    });
    await expect(db.comoUsuario(cl, (c) => c.query("select public.publicacao_texto($1)", [publicacao]))).rejects.toMatchObject({ code: "42501" });
    await expect(db.comoUsuario(cl, (c) => c.query("select public.marcar_sigilo($1, true)", [processo]))).rejects.toMatchObject({ code: "42501" });
    await expect(db.comoUsuario(cl, (c) => c.query("select public.criar_tarefa('Tarefa', 'outro', $1)", [processo]))).rejects.toMatchObject({ code: "42501" });
    // Nada mudou
    const { rows } = await db.client.query("select status::text from public.prazos where id = $1", [prazo]);
    expect(rows[0].status).toBe("sugerido");
  });

  it("(a) inserir também é barrado em aal1", async () => {
    const cl = claims(socioComFator, "socio", "aal1");
    await expect(
      db.comoUsuario(cl, (c) => c.query("insert into public.clientes (escritorio_id, nome) values ($1, 'Cliente X')", [escritorio])),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("(b) o mesmo sócio em aal2 vê as linhas e decide", async () => {
    const cl = claims(socioComFator, "socio", "aal2");
    expect(await db.comoUsuario(cl, contarPrazos)).toBe(1);
    const texto = await db.comoUsuario(cl, (c) => c.query("select public.publicacao_texto($1) as t", [publicacao]).then((r) => r.rows[0].t));
    expect(texto).toBe("Texto da publicação");
    const tarefa = await db.comoUsuario(cl, (c) => c.query("select public.criar_tarefa('Tarefa em aal2', 'outro', $1) as id", [processo]).then((r) => r.rows[0].id as string));
    expect(tarefa).toBeTruthy();
    await db.comoUsuario(cl, (c) => c.query("select public.confirmar_prazo($1)", [prazo]));
    const { rows } = await db.client.query("select status::text from public.prazos where id = $1", [prazo]);
    expect(rows[0].status).toBe("confirmado");
  });

  it("(c) sócio sem fator cadastrado em aal1 vê as linhas (carência para cadastrar o primeiro)", async () => {
    expect(await db.comoUsuario(claims(socioSemFator, "socio", "aal1"), contarPrazos)).toBe(1);
    expect(await db.comoUsuario(claims(socioSemFator, "socio"), contarPrazos)).toBe(1);
  });

  it("(c) fator só iniciado (unverified) não conta como cadastrado", async () => {
    expect(await db.comoUsuario(claims(socioPendente, "socio", "aal1"), contarPrazos)).toBe(1);
  });

  it("(d) estagiário e administrativo em aal1 veem as linhas", async () => {
    expect(await db.comoUsuario(claims(estagiario, "estagiario", "aal1"), contarPrazos)).toBe(1);
    expect(await db.comoUsuario(claims(administrativo, "administrativo", "aal1"), contarPrazos)).toBe(1);
  });

  it("(e) service role e conexão direta ignoram a regra", async () => {
    expect(await comoServiceRole(contarPrazos)).toBe(1);
    expect(await comoServiceRole((c) => c.query("select app.mfa_satisfeita() as ok").then((r) => r.rows[0].ok))).toBe(true);
    expect(await db.client.query("select app.mfa_satisfeita() as ok").then((r) => r.rows[0].ok)).toBe(true);
    // Job transiciona publicação sem JWT de pessoa
    await db.client.query("select public.transicionar_publicacao($1, 'classificada', '{\"tipo\": \"intimacao\"}'::jsonb)", [publicacao]);
    const { rows } = await db.client.query("select status::text from public.publicacoes where id = $1", [publicacao]);
    expect(rows[0].status).toBe("classificada");
  });

  it("(f) escritorios e escritorio_membros continuam legíveis em aal1 (layout e cadastro do fator)", async () => {
    const r = await db.comoUsuario(claims(socioComFator, "socio", "aal1"), async (c) => ({
      escritorios: (await c.query("select count(*)::int as n from public.escritorios")).rows[0].n as number,
      membros: (await c.query("select count(*)::int as n from public.escritorio_membros")).rows[0].n as number,
    }));
    expect(r.escritorios).toBe(1);
    expect(r.membros).toBe(6);
  });

  it("as policies restritivas existem nas tabelas sensíveis e não nas de sessão", async () => {
    const { rows } = await db.client.query("select tablename from pg_policies where policyname = 'mfa_obrigatorio' and permissive = 'RESTRICTIVE' order by tablename");
    const tabelas = rows.map((r) => r.tablename as string);
    for (const t of ["processos", "processo_partes", "clientes", "publicacoes", "publicacao_eventos", "prazos", "prazos_eventos", "tarefas", "tarefa_eventos", "aprovacoes", "ia_execucoes", "notificacoes", "conversas", "mensagens"]) {
      expect(tabelas).toContain(t);
    }
    for (const t of ["integracoes", "divergencias_operacao", "atos_prazo", "exportacoes", "processo_colaboradores", "auditoria_acessos", "ausencias", "regras_notificacao", "fases_kanban", "captacoes"]) {
      expect(tabelas).toContain(t);
    }
    for (const t of ["escritorios", "escritorio_membros", "usuario_telefones", "escritorio_configuracoes"]) {
      expect(tabelas).not.toContain(t);
    }
  });

  // --- 0022: fechamento das brechas apontadas na revisão ---

  it("(g) sócio em aal1 lê a equipe, mas não convida, promove nem desativa membro; telefone idem", async () => {
    const cl = claims(socioComFator, "socio", "aal1");
    await expect(
      db.comoUsuario(cl, (c) => c.query("insert into public.escritorio_membros (escritorio_id, email_convite, papel, nome_completo) values ($1, 'intruso@teste.local', 'socio', 'Intruso')", [escritorio])),
    ).rejects.toThrow(/row-level security/);
    await expect(db.comoUsuario(cl, (c) => c.query("update public.escritorio_membros set papel = 'socio' where usuario_id = $1", [advogado]))).resolves.toMatchObject({ rowCount: 0 });
    await expect(
      db.comoUsuario(cl, (c) => c.query("insert into public.usuario_telefones (escritorio_id, usuario_id, telefone_e164) values ($1, $2, '+5565999990000')", [escritorio, socioComFator])),
    ).rejects.toThrow(/row-level security/);
    // Em aal2 a mesma inserção passa
    const ok = await db.comoUsuario(claims(socioComFator, "socio", "aal2"), (c) =>
      c.query("insert into public.escritorio_membros (escritorio_id, email_convite, papel, nome_completo) values ($1, 'novo.membro@teste.local', 'estagiario', 'Novo') returning id", [escritorio]),
    );
    expect(ok.rowCount).toBe(1);
    const papel = await db.client.query("select papel::text from public.escritorio_membros where usuario_id = $1", [advogado]);
    expect(papel.rows[0].papel).toBe("advogado");
  });

  it("(g) gerar_codigo_telefone e integracao_definir_segredo exigem segundo fator", async () => {
    const telefone = await db.client.query("insert into public.usuario_telefones (escritorio_id, usuario_id, telefone_e164) values ($1, $2, '+5565999990001') returning id", [escritorio, socioComFator]);
    const cl = claims(socioComFator, "socio", "aal1");
    await expect(db.comoUsuario(cl, (c) => c.query("select public.gerar_codigo_telefone($1)", [telefone.rows[0].id]))).rejects.toMatchObject({ code: "42501", message: "Segundo fator obrigatório" });
    await expect(db.comoUsuario(cl, (c) => c.query("select public.integracao_definir_segredo('datajud', 'chave')"))).rejects.toMatchObject({ code: "42501", message: "Segundo fator obrigatório" });
    const codigo = await db.comoUsuario(claims(socioComFator, "socio", "aal2"), (c) => c.query("select public.gerar_codigo_telefone($1) as c", [telefone.rows[0].id]).then((r) => r.rows[0].c as string));
    expect(codigo).toMatch(/^\d{6}$/);
  });

  it("(h) a carência vale só para conta com menos de 7 dias: conta antiga sem fator fica sem dados em aal1", async () => {
    await db.client.query("update auth.users set created_at = now() - interval '8 days' where id = $1", [socioSemFator]);
    expect(await db.comoUsuario(claims(socioSemFator, "socio", "aal1"), contarPrazos)).toBe(0);
    expect(await db.comoUsuario(claims(socioSemFator, "socio", "aal1"), (c) => c.query("select app.mfa_satisfeita() as ok").then((r) => r.rows[0].ok))).toBe(false);
    // ...mas ainda lê escritorios/membros para chegar à tela de cadastro, e em aal2 volta a ver tudo
    const membros = await db.comoUsuario(claims(socioSemFator, "socio", "aal1"), (c) => c.query("select count(*)::int as n from public.escritorio_membros").then((r) => r.rows[0].n as number));
    expect(membros).toBeGreaterThan(0);
    expect(await db.comoUsuario(claims(socioSemFator, "socio", "aal2"), contarPrazos)).toBe(1);
    await db.client.query("update auth.users set created_at = now() where id = $1", [socioSemFator]);
  });
});
