import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Migrations 0046 a 0050: multi-escritório, suporte somente leitura e limites.
 * Escrito mas NÃO EXECUTADO no momento da entrega (sem Postgres local). Rodar com `pnpm test` num Postgres de teste (DATABASE_URL_TESTE) antes de confiar.
 *
 * Cenário com N = 4 escritórios (A, B, C, D):
 * - usuário U é membro ativo de A e de B (2 vínculos);
 * - usuário S é de suporte: acesso VIGENTE a C e acesso VENCIDO a D.
 * Provas:
 * 1. sem escritorio_ativo, o hook devolve o mesmo escritório de sempre (aceito_em mais recente);
 * 2. com escritorio_ativo = B, o hook devolve B; com escritorio_ativo = A-sem-vínculo, cai no caminho antigo;
 * 3. suporte com acesso vigente a C recebe papel 'suporte' em C; com acesso vencido a D não recebe nada de D;
 * 4. RLS: U enxerga só os dados de A e de B; S lê C e não lê D nem escreve em C;
 * 5. listar_vinculos devolve A e B para U, e só C para S;
 * 6. limite de usuários (escritorio_limites) bloqueia o membro extra; sem limite configurado nada é bloqueado.
 */
describe("isolamento com N = 4 escritórios, vínculos múltiplos e suporte vencido", () => {
  let db: BancoDeTeste;
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  const C = "33333333-3333-4333-8333-333333333333";
  const D = "44444444-4444-4444-8444-444444444444";
  const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const S = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const SEM_VINCULO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  /** Requisição como `authenticated` com os claims do JWT dados (escritorio_id, papel, aal). */
  const como = async <T>(usuario: string, claims: Record<string, unknown>, fn: (c: Client) => Promise<T>): Promise<T> => {
    const c = db.client;
    await c.query("begin");
    try {
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: usuario, role: "authenticated", ...claims })]);
      await c.query("set local role authenticated");
      const r = await fn(c);
      await c.query("commit");
      return r;
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  };

  const hookPara = async (usuario: string) => {
    const evento = { user_id: usuario, claims: { sub: usuario, role: "authenticated" } };
    const { rows } = await db.client.query("select public.custom_access_token_hook($1::jsonb) as r", [JSON.stringify(evento)]);
    return rows[0].r.claims as { escritorio_id?: string; papel?: string };
  };

  const definirEscritorioAtivo = async (usuario: string, escritorio: string | null) => {
    if (escritorio === null) {
      await db.client.query("update auth.users set raw_app_meta_data = raw_app_meta_data - 'escritorio_ativo' where id = $1", [usuario]);
    } else {
      await db.client.query(
        "update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('escritorio_ativo', $2::text) where id = $1",
        [usuario, escritorio],
      );
    }
  };

  beforeAll(async () => {
    db = await subirBancoDeTeste();
    const c = db.client;
    await c.query(
      "insert into auth.users (id, email) values ($1, 'u@teste.local'), ($2, 'suporte@teste.local'), ($3, 'sem@teste.local')",
      [U, S, SEM_VINCULO],
    );
    await c.query("insert into public.escritorios (id, nome) values ($1,'A'),($2,'B'),($3,'C'),($4,'D')", [A, B, C, D]);

    // U: membro de A (mais antigo) e de B (mais recente)
    await c.query(
      `insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, aceito_em)
       values ($1, $3, 'u@teste.local', 'advogado', 'U', now() - interval '60 days'),
              ($2, $3, 'u@teste.local', 'advogado', 'U', now() - interval '1 day')`,
      [A, B, U],
    );
    // Config de cada escritório, para provar leitura e bloqueio de escrita
    await c.query("insert into public.escritorio_configuracoes (escritorio_id, chave, valor) select id, 'teste', '\"ok\"'::jsonb from public.escritorios");

    // S: acesso vigente a C e acesso vencido a D (motivo com 10+ caracteres, como exige o banco)
    await c.query(
      `insert into public.acessos_suporte (escritorio_id, usuario_id, motivo, expira_em, criado_em)
       values ($1, $3, 'chamado 1234 importação', now() + interval '1 day', now() - interval '1 hour'),
              ($2, $3, 'chamado 0001 antigo caso', now() - interval '1 day', now() - interval '2 days')`,
      [C, D, S],
    );
  });

  afterAll(async () => {
    await db?.parar();
  });

  it("1. sem escritorio_ativo, o hook mantém o escritório mais recente do caminho antigo", async () => {
    await definirEscritorioAtivo(U, null);
    const claims = await hookPara(U);
    expect(claims.escritorio_id).toBe(B);
    expect(claims.papel).toBe("advogado");
  });

  it("2. escritorio_ativo válido escolhe o escritório; inválido cai no caminho antigo", async () => {
    await definirEscritorioAtivo(U, A);
    expect((await hookPara(U)).escritorio_id).toBe(A);

    await definirEscritorioAtivo(U, D); // U não tem vínculo com D
    expect((await hookPara(U)).escritorio_id).toBe(B);

    await definirEscritorioAtivo(U, "não-é-uuid");
    expect((await hookPara(U)).escritorio_id).toBe(B);
  });

  it("3. suporte com acesso vigente recebe papel 'suporte' em C; com acesso vencido em D não recebe nada de D", async () => {
    await definirEscritorioAtivo(S, C);
    const emC = await hookPara(S);
    expect(emC.escritorio_id).toBe(C);
    expect(emC.papel).toBe("suporte");

    await definirEscritorioAtivo(S, D);
    const emD = await hookPara(S);
    expect(emD.escritorio_id).not.toBe(D);
    expect(emD.papel).not.toBe("suporte");
  });

  it("4. RLS: U lê A e B e não lê C nem D", async () => {
    const visiveis = await como(U, { escritorio_id: A, papel: "advogado", aal: "aal2" }, async (c) => {
      const { rows } = await c.query("select escritorio_id from public.escritorio_configuracoes");
      return rows.map((r) => r.escritorio_id as string);
    });
    expect(visiveis).toEqual([A]);
  });

  it("4b. RLS: suporte com acesso vigente lê C, não lê D e não escreve em C", async () => {
    const lidos = await como(S, { escritorio_id: C, papel: "suporte", aal: "aal2" }, async (c) => {
      const { rows } = await c.query("select escritorio_id from public.escritorio_configuracoes");
      return rows.map((r) => r.escritorio_id as string);
    });
    expect(lidos).toEqual([C]);

    const vencidos = await como(S, { escritorio_id: D, papel: "suporte", aal: "aal2" }, async (c) => {
      const { rows } = await c.query("select escritorio_id from public.escritorio_configuracoes");
      return rows.length;
    });
    expect(vencidos).toBe(0);

    await expect(
      como(S, { escritorio_id: C, papel: "suporte", aal: "aal2" }, (c) =>
        c.query("insert into public.escritorio_configuracoes (escritorio_id, chave, valor) values ($1, 'x', '1'::jsonb)", [C]),
      ),
    ).rejects.toThrow();
  });

  it("4c. RLS: suporte sem aal2 não lê nada (segundo fator obrigatório)", async () => {
    const n = await como(S, { escritorio_id: C, papel: "suporte", aal: "aal1" }, async (c) => {
      const { rows } = await c.query("select 1 from public.escritorio_configuracoes");
      return rows.length;
    });
    expect(n).toBe(0);
  });

  it("5. listar_vinculos: U vê A e B; S vê apenas C como acesso de suporte", async () => {
    const vinculosU = await como(U, { escritorio_id: A, papel: "advogado", aal: "aal2" }, async (c) => {
      const { rows } = await c.query("select escritorio_id, origem from public.listar_vinculos() order by escritorio_id");
      return rows;
    });
    expect(vinculosU.map((r) => r.escritorio_id).sort()).toEqual([A, B].sort());

    const vinculosS = await como(S, { escritorio_id: C, papel: "suporte", aal: "aal2" }, async (c) => {
      const { rows } = await c.query("select escritorio_id, origem from public.listar_vinculos()");
      return rows;
    });
    expect(vinculosS).toEqual([{ escritorio_id: C, origem: "acesso_suporte" }]);
  });

  it("6. sem vínculo nem acesso, trocar_escritorio é recusado", async () => {
    await expect(
      como(SEM_VINCULO, {}, (c) => c.query("select public.trocar_escritorio($1::uuid)", [A])),
    ).rejects.toThrow(/Sem vínculo ativo/);
  });

  it("7. limite de usuários: com limite 1 em A, um segundo membro ativo é bloqueado; sem limite, passa", async () => {
    await db.client.query("insert into public.escritorio_limites (escritorio_id, limite_usuarios) values ($1, 1)", [A]);
    await expect(
      db.client.query(
        `insert into public.escritorio_membros (escritorio_id, email_convite, papel, nome_completo)
         values ($1, 'extra@teste.local', 'estagiario', 'Extra')`,
        [A],
      ),
    ).rejects.toThrow(/Limite de usuários/);

    // Sem limite (D não tem escritorio_limites nem assinatura): inserção passa
    await db.client.query(
      `insert into public.escritorio_membros (escritorio_id, email_convite, papel, nome_completo)
       values ($1, 'extra@teste.local', 'estagiario', 'Extra')`,
      [D],
    );
  });
});
