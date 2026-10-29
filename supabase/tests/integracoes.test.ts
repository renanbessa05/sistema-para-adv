import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Prova, num Postgres real com o Vault emulado do shim, a migration 0017 (segredos de integração):
 * 1. o sócio grava o segredo pela RPC e a linha de public.integracoes não contém o valor;
 * 2. advogado e estagiário recebem 42501; sócio de outro escritório não alcança a linha;
 * 3. usuário autenticado não executa segredo_integracao; a service role lê o valor;
 * 4. regravar troca o valor sem trocar a referência (rotação); registrar_erro e redefinir limpam;
 * 5. remover apaga do Vault e zera a referência;
 * 6. sem Vault, a gravação falha com erro claro e a leitura devolve null.
 */
describe("integrações: segredos no Vault", () => {
  let db: BancoDeTeste;
  const escritorioA = "11111111-1111-4111-8111-111111111111";
  const escritorioB = "22222222-2222-4222-8222-222222222222";
  const socioA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const advogadoA = "abababab-abab-4bab-8bab-abababababab";
  const estagiarioA = "acacacac-acac-4cac-8cac-acacacacacac";
  const socioB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const TOKEN = "EAAB-token-secreto-do-whatsapp-0001";
  const TOKEN_NOVO = "EAAB-token-secreto-do-whatsapp-0002";
  const CHAVE_DATAJUD = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";

  const comoSocioA = <T>(fn: (c: BancoDeTeste["client"]) => Promise<T>) => db.comoUsuario({ sub: socioA, escritorio_id: escritorioA, papel: "socio" }, fn);
  const comoAdvogadoA = <T>(fn: (c: BancoDeTeste["client"]) => Promise<T>) => db.comoUsuario({ sub: advogadoA, escritorio_id: escritorioA, papel: "advogado" }, fn);
  const comoEstagiarioA = <T>(fn: (c: BancoDeTeste["client"]) => Promise<T>) => db.comoUsuario({ sub: estagiarioA, escritorio_id: escritorioA, papel: "estagiario" }, fn);
  const comoSocioB = <T>(fn: (c: BancoDeTeste["client"]) => Promise<T>) => db.comoUsuario({ sub: socioB, escritorio_id: escritorioB, papel: "socio" }, fn);
  /** A service role de verdade (não o superusuário): só o que foi concedido a ela. */
  const comoServiceRole = async <T>(fn: (c: BancoDeTeste["client"]) => Promise<T>): Promise<T> => {
    await db.client.query("begin");
    try {
      await db.client.query("set local role service_role");
      const r = await fn(db.client);
      await db.client.query("commit");
      return r;
    } catch (e) {
      await db.client.query("rollback");
      throw e;
    }
  };

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

  it("sócio grava o segredo: vai para o Vault com nome único e a linha de integracoes não contém o valor", async () => {
    await comoSocioA((c) => c.query("select public.integracao_definir_segredo('whatsapp', $1, '{\"phone_number_id\": \"123456\"}'::jsonb)", [TOKEN]));

    const { rows } = await db.client.query("select * from public.integracoes where escritorio_id = $1 and tipo = 'whatsapp'", [escritorioA]);
    expect(rows).toHaveLength(1);
    const linha = rows[0];
    expect(linha.status).toBe("ativa");
    expect(linha.ultimo_erro).toBeNull();
    expect(linha.vault_secret_id).not.toBeNull();
    expect(linha.config).toEqual({ phone_number_id: "123456" });
    expect(JSON.stringify(linha)).not.toContain(TOKEN);

    // Em nenhuma coluna texto da tabela de integrações aparece o segredo
    const texto = await db.client.query("select count(*)::int as n from public.integracoes i where i::text like '%' || $1 || '%'", [TOKEN]);
    expect(texto.rows[0].n).toBe(0);

    const vault = await db.client.query("select name, secret from vault.secrets where id = $1", [linha.vault_secret_id]);
    expect(vault.rows[0]).toEqual({ name: `integracao:${escritorioA}:whatsapp`, secret: TOKEN });

    // O sócio vê a configuração (sem segredo) pela policy de select
    const visto = await comoSocioA(async (c) => (await c.query("select tipo, status, config, vault_secret_id is not null as no_vault from public.integracoes")).rows);
    expect(visto).toEqual([{ tipo: "whatsapp", status: "ativa", config: { phone_number_id: "123456" }, no_vault: true }]);
  });

  it("segredo vazio e config que não é objeto são recusados", async () => {
    await expect(comoSocioA((c) => c.query("select public.integracao_definir_segredo('datajud', '   ')"))).rejects.toThrow(/Informe o segredo/);
    await expect(comoSocioA((c) => c.query("select public.integracao_definir_segredo('datajud', $1, '[1,2]'::jsonb)", [CHAVE_DATAJUD]))).rejects.toThrow(/objeto JSON/);
  });

  it("advogado e estagiário recebem 42501; sócio de outro escritório não enxerga nem remove", async () => {
    await expect(comoAdvogadoA((c) => c.query("select public.integracao_definir_segredo('datajud', $1)", [CHAVE_DATAJUD]))).rejects.toMatchObject({ code: "42501" });
    await expect(comoEstagiarioA((c) => c.query("select public.integracao_definir_segredo('datajud', $1)", [CHAVE_DATAJUD]))).rejects.toMatchObject({ code: "42501" });
    await expect(comoAdvogadoA((c) => c.query("select public.integracao_remover_segredo('whatsapp')"))).rejects.toMatchObject({ code: "42501" });

    const deB = await comoSocioB(async (c) => (await c.query("select count(*)::int as n from public.integracoes")).rows[0].n);
    expect(deB).toBe(0);
    await expect(comoSocioB((c) => c.query("select public.integracao_remover_segredo('whatsapp')"))).rejects.toThrow(/não configurada/);

    // Escrita direta na tabela é negada mesmo ao sócio: só pelas RPCs
    await expect(comoSocioA((c) => c.query("update public.integracoes set status = 'inativa' where escritorio_id = $1", [escritorioA]))).rejects.toThrow(/permission denied/);
    await expect(comoSocioA((c) => c.query("insert into public.integracoes (escritorio_id, tipo) values ($1, 'datajud')", [escritorioA]))).rejects.toThrow(/permission denied/);
    await expect(comoSocioA((c) => c.query("delete from public.integracoes where escritorio_id = $1", [escritorioA]))).rejects.toThrow(/permission denied/);
  });

  it("usuário autenticado não lê o valor; a service role lê via segredo_integracao", async () => {
    await expect(comoSocioA((c) => c.query("select public.segredo_integracao($1, 'whatsapp')", [escritorioA]))).rejects.toThrow(/permission denied/);
    await expect(comoAdvogadoA((c) => c.query("select public.segredo_integracao($1, 'whatsapp')", [escritorioA]))).rejects.toThrow(/permission denied/);
    // O Vault também não é alcançável pelo usuário
    await expect(comoSocioA((c) => c.query("select count(*) from vault.secrets"))).rejects.toThrow(/permission denied/);

    const lido = await comoServiceRole(async (c) => (await c.query("select public.segredo_integracao($1, 'whatsapp') as s, public.segredo_integracao($1, 'datajud') as d, public.segredo_integracao($2, 'whatsapp') as b", [escritorioA, escritorioB])).rows[0]);
    expect(lido).toEqual({ s: TOKEN, d: null, b: null });

    // A service role não grava pela RPC do sócio sem sessão (não há escritório no JWT)
    await expect(comoServiceRole((c) => c.query("select public.integracao_definir_segredo('datajud', $1)", [CHAVE_DATAJUD]))).rejects.toMatchObject({ code: "42501" });
  });

  it("regravar troca o valor sem trocar a referência; registrar_erro marca e a regravação limpa", async () => {
    const antes = await db.client.query("select vault_secret_id, atualizado_em from public.integracoes where escritorio_id = $1 and tipo = 'whatsapp'", [escritorioA]);
    await comoSocioA((c) => c.query("select public.integracao_definir_segredo('whatsapp', $1, '{\"phone_number_id\": \"654321\"}'::jsonb)", [TOKEN_NOVO]));
    const depois = await db.client.query("select vault_secret_id, atualizado_em, config from public.integracoes where escritorio_id = $1 and tipo = 'whatsapp'", [escritorioA]);
    expect(depois.rows[0].vault_secret_id).toBe(antes.rows[0].vault_secret_id);
    expect(depois.rows[0].config).toEqual({ phone_number_id: "654321" });
    expect(new Date(depois.rows[0].atualizado_em).getTime()).toBeGreaterThanOrEqual(new Date(antes.rows[0].atualizado_em).getTime());
    const soUm = await db.client.query("select count(*)::int as n from vault.secrets where name like 'integracao:%'");
    expect(soUm.rows[0].n).toBe(1);
    const lido = await comoServiceRole(async (c) => (await c.query("select public.segredo_integracao($1, 'whatsapp') as s", [escritorioA])).rows[0].s);
    expect(lido).toBe(TOKEN_NOVO);

    // Job registra erro (ex.: Meta recusou o token); o sócio vê; a regravação limpa
    await expect(comoSocioA((c) => c.query("select public.integracao_registrar_erro($1, 'whatsapp', 'x')", [escritorioA]))).rejects.toThrow(/permission denied/);
    await comoServiceRole((c) => c.query("select public.integracao_registrar_erro($1, 'whatsapp', 'Graph API 190: token expirado')", [escritorioA]));
    const comErro = await comoSocioA(async (c) => (await c.query("select status, ultimo_erro from public.integracoes where tipo = 'whatsapp'")).rows[0]);
    expect(comErro).toEqual({ status: "erro", ultimo_erro: "Graph API 190: token expirado" });
    await comoSocioA((c) => c.query("select public.integracao_definir_segredo('whatsapp', $1)", [TOKEN_NOVO]));
    const limpo = await db.client.query("select status, ultimo_erro, config from public.integracoes where escritorio_id = $1 and tipo = 'whatsapp'", [escritorioA]);
    expect(limpo.rows[0]).toEqual({ status: "ativa", ultimo_erro: null, config: { phone_number_id: "654321" } });

    // Erro numa integração ainda sem linha (chave vinda do ambiente) cria a linha só com o erro
    await comoServiceRole((c) => c.query("select public.integracao_registrar_erro($1, 'datajud', 'DataJud devolveu 401')", [escritorioA]));
    const datajud = await db.client.query("select status, ultimo_erro, vault_secret_id from public.integracoes where escritorio_id = $1 and tipo = 'datajud'", [escritorioA]);
    expect(datajud.rows[0]).toEqual({ status: "erro", ultimo_erro: "DataJud devolveu 401", vault_secret_id: null });
  });

  it("remover apaga do Vault, zera a referência e deixa a integração inativa", async () => {
    const { rows } = await db.client.query("select vault_secret_id from public.integracoes where escritorio_id = $1 and tipo = 'whatsapp'", [escritorioA]);
    const secretId = rows[0].vault_secret_id as string;
    await comoSocioA((c) => c.query("select public.integracao_remover_segredo('whatsapp')"));
    const linha = await db.client.query("select vault_secret_id, status, ultimo_erro, config from public.integracoes where escritorio_id = $1 and tipo = 'whatsapp'", [escritorioA]);
    expect(linha.rows[0]).toEqual({ vault_secret_id: null, status: "inativa", ultimo_erro: null, config: { phone_number_id: "654321" } });
    const noVault = await db.client.query("select count(*)::int as n from vault.secrets where id = $1", [secretId]);
    expect(noVault.rows[0].n).toBe(0);
    const lido = await comoServiceRole(async (c) => (await c.query("select public.segredo_integracao($1, 'whatsapp') as s", [escritorioA])).rows[0].s);
    expect(lido).toBeNull();

    // Gravar de novo cria um segredo novo (referência nova) e reativa
    await comoSocioA((c) => c.query("select public.integracao_definir_segredo('whatsapp', $1)", [TOKEN]));
    const nova = await db.client.query("select vault_secret_id, status from public.integracoes where escritorio_id = $1 and tipo = 'whatsapp'", [escritorioA]);
    expect(nova.rows[0].status).toBe("ativa");
    expect(nova.rows[0].vault_secret_id).not.toBeNull();
    expect(nova.rows[0].vault_secret_id).not.toBe(secretId);
  });

  it("sem Vault: gravar falha com erro claro e a leitura devolve null (schema derrubado dentro de uma transação revertida)", async () => {
    const c = db.client;
    await c.query("begin");
    try {
      await c.query("drop schema vault cascade");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: socioA, escritorio_id: escritorioA, papel: "socio" })]);
      await c.query("savepoint antes");
      await c.query("set local role authenticated");
      await expect(c.query("select public.integracao_definir_segredo('datajud', $1)", [CHAVE_DATAJUD])).rejects.toThrow(/Vault indisponível neste banco/);
      await c.query("rollback to savepoint antes");
      await c.query("set local role service_role");
      const lido = await c.query("select public.segredo_integracao($1, 'whatsapp') as s", [escritorioA]);
      expect(lido.rows[0].s).toBeNull();
    } finally {
      await c.query("rollback");
    }
    // Nada mudou fora da transação
    const intacto = await c.query("select count(*)::int as n from vault.secrets where name like 'integracao:%'");
    expect(intacto.rows[0].n).toBe(1);
  });
});
