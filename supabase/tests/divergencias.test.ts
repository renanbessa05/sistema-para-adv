import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { montarCnj } from "../../src/lib/cnj/numero-cnj";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Migrations 0018 (divergencias_operacao) e 0019 (marcar_prazos_vencidos devolve os ids):
 * 1. isolamento entre escritórios; 2. estagiário só lê; administrativo, advogado e sócio inserem;
 * 3. resolver grava resolvida_em; ninguém apaga; 4. a RPC detalhada devolve id/processo/responsável
 *    de cada prazo vencido e a RPC antiga continua devolvendo a contagem.
 */
describe("divergências da operação paralela e prazos vencidos com ids", () => {
  let db: BancoDeTeste;
  const escritorioA = "11111111-1111-4111-8111-111111111111";
  const escritorioB = "22222222-2222-4222-8222-222222222222";
  const socioA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const advogadoA = "abababab-abab-4bab-8bab-abababababab";
  const estagiarioA = "acacacac-acac-4cac-8cac-acacacacacac";
  const adminA = "aeaeaeae-aeae-4eae-8eae-aeaeaeaeaeae";
  const socioB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const comoSocioA = { sub: socioA, escritorio_id: escritorioA, papel: "socio" };
  const comoAdvogadoA = { sub: advogadoA, escritorio_id: escritorioA, papel: "advogado" };
  const comoEstagiarioA = { sub: estagiarioA, escritorio_id: escritorioA, papel: "estagiario" };
  const comoAdminA = { sub: adminA, escritorio_id: escritorioA, papel: "administrativo" };
  const comoSocioB = { sub: socioB, escritorio_id: escritorioB, papel: "socio" };

  let processoA: string;
  let processoB: string;

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

  const inserirDivergencia = (claims: Record<string, unknown>, dados: { semana: string; tipo?: string; descricao?: string; causa?: string | null; processo?: string | null; prazo?: string | null }) =>
    db.comoUsuario(claims, async (c) => {
      const r = await c.query(
        `insert into public.divergencias_operacao (escritorio_id, semana, tipo, descricao, causa, processo_id, prazo_id, registrada_por)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [claims.escritorio_id, dados.semana, dados.tipo ?? "data_prazo", dados.descricao ?? "sistema 10/11, PJe 11/11", dados.causa ?? null, dados.processo ?? null, dados.prazo ?? null, claims.sub],
      );
      return r.rows[0].id as string;
    });

  beforeAll(async () => {
    db = await subirBancoDeTeste();
    const c = db.client;
    for (const [id, email] of [
      [socioA, "socio.a@teste.local"],
      [advogadoA, "adv.a@teste.local"],
      [estagiarioA, "est.a@teste.local"],
      [adminA, "adm.a@teste.local"],
      [socioB, "socio.b@teste.local"],
    ]) {
      await c.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
    }
    await c.query("insert into public.escritorios (id, nome) values ($1, 'Escritório A'), ($2, 'Escritório B')", [escritorioA, escritorioB]);
    await c.query(
      `insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, oab_numero, oab_uf)
       values ($1, $2, 'socio.a@teste.local', 'socio', 'Sócia A', '20817', 'MT'),
              ($1, $3, 'adv.a@teste.local', 'advogado', 'Advogado A', '30000', 'MT'),
              ($1, $4, 'est.a@teste.local', 'estagiario', 'Estagiário A', null, null),
              ($1, $5, 'adm.a@teste.local', 'administrativo', 'Administrativo A', null, null),
              ($6, $7, 'socio.b@teste.local', 'socio', 'Sócio B', '40000', 'MT')`,
      [escritorioA, socioA, advogadoA, estagiarioA, adminA, escritorioB, socioB],
    );
    const procs = await c.query(
      `insert into public.processos (escritorio_id, numero_cnj, responsavel_id, segredo_justica)
       values ($1, $2, $3, false), ($4, $5, $6, false) returning id, escritorio_id`,
      [escritorioA, montarCnj(300, 2025, 8, "11", "0041"), advogadoA, escritorioB, montarCnj(301, 2025, 8, "11", "0041"), socioB],
    );
    processoA = procs.rows.find((r) => r.escritorio_id === escritorioA)!.id as string;
    processoB = procs.rows.find((r) => r.escritorio_id === escritorioB)!.id as string;
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  it("administrativo, advogado e sócio inserem; estagiário só lê", async () => {
    const idAdmin = await inserirDivergencia(comoAdminA, { semana: "2026-10-30", processo: processoA });
    const idAdv = await inserirDivergencia(comoAdvogadoA, { semana: "2026-10-30", tipo: "classificacao_errada", causa: "IA classificou despacho como intimação" });
    const idSocio = await inserirDivergencia(comoSocioA, { semana: "2026-10-23", tipo: "outro", descricao: "conferência sem divergência", causa: "conferência sem divergência" });
    expect([idAdmin, idAdv, idSocio].every(Boolean)).toBe(true);

    await expect(inserirDivergencia(comoEstagiarioA, { semana: "2026-10-30" })).rejects.toThrow(/row-level security|permission denied/);

    const lidas = await db.comoUsuario(comoEstagiarioA, async (c) => (await c.query("select count(*)::int as n from public.divergencias_operacao")).rows[0].n);
    expect(lidas).toBe(3);

    const gravada = await db.client.query("select escritorio_id, semana::text, tipo::text, causa, registrada_por, resolvida_em, processo_id from public.divergencias_operacao where id = $1", [idAdmin]);
    expect(gravada.rows[0]).toEqual({ escritorio_id: escritorioA, semana: "2026-10-30", tipo: "data_prazo", causa: null, registrada_por: adminA, resolvida_em: null, processo_id: processoA });

    // descrição vazia e tipo fora do enum são recusados
    await expect(inserirDivergencia(comoAdminA, { semana: "2026-10-30", descricao: "   " })).rejects.toThrow(/divergencia_descricao_nao_vazia/);
    await expect(inserirDivergencia(comoAdminA, { semana: "2026-10-30", tipo: "inexistente" })).rejects.toThrow(/invalid input value for enum/);
  });

  it("isola escritórios: B não vê, não edita e não insere em A", async () => {
    const idB = await inserirDivergencia(comoSocioB, { semana: "2026-10-30", tipo: "publicacao_nao_captada", processo: processoB });

    const vistasPorB = await db.comoUsuario(comoSocioB, async (c) => (await c.query("select id, escritorio_id from public.divergencias_operacao")).rows);
    expect(vistasPorB).toEqual([{ id: idB, escritorio_id: escritorioB }]);

    const vistasPorA = await db.comoUsuario(comoSocioA, async (c) => (await c.query("select distinct escritorio_id from public.divergencias_operacao")).rows);
    expect(vistasPorA).toEqual([{ escritorio_id: escritorioA }]);

    // Inserir com escritorio_id de A sendo de B
    await expect(db.comoUsuario(comoSocioB, (c) => c.query("insert into public.divergencias_operacao (escritorio_id, semana, descricao) values ($1, '2026-10-30', 'x')", [escritorioA]))).rejects.toThrow(/row-level security/);

    // Update de B sobre linha de A não alcança nada
    const alvoA = (await db.client.query("select id from public.divergencias_operacao where escritorio_id = $1 limit 1", [escritorioA])).rows[0].id as string;
    const afetadas = await db.comoUsuario(comoSocioB, async (c) => (await c.query("update public.divergencias_operacao set causa = 'invasão' where id = $1", [alvoA])).rowCount);
    expect(afetadas).toBe(0);
  });

  it("resolver grava resolvida_em (e causa/correção); estagiário não resolve; ninguém apaga", async () => {
    const id = await inserirDivergencia(comoAdminA, { semana: "2026-11-06", tipo: "prazo_nao_sugerido", processo: processoA });

    // Policy restritiva de update com using(false) filtra a linha: o estagiário "atualiza" zero linhas
    const peloEstagiario = await db.comoUsuario(comoEstagiarioA, async (c) => (await c.query("update public.divergencias_operacao set resolvida_em = now() where id = $1", [id])).rowCount);
    expect(peloEstagiario).toBe(0);
    expect((await db.client.query("select resolvida_em from public.divergencias_operacao where id = $1", [id])).rows[0].resolvida_em).toBeNull();

    const antes = await db.client.query("select atualizado_em from public.divergencias_operacao where id = $1", [id]);
    const resolvidas = await db.comoUsuario(comoAdminA, async (c) => (await c.query("update public.divergencias_operacao set resolvida_em = now(), causa = 'ato sem sinônimo cadastrado', correcao = 'sinônimo incluído em Atos' where id = $1 and resolvida_em is null", [id])).rowCount);
    expect(resolvidas).toBe(1);
    const depois = await db.client.query("select resolvida_em, causa, correcao, atualizado_em from public.divergencias_operacao where id = $1", [id]);
    expect(depois.rows[0].resolvida_em).not.toBeNull();
    expect(depois.rows[0].causa).toBe("ato sem sinônimo cadastrado");
    expect(depois.rows[0].correcao).toBe("sinônimo incluído em Atos");
    expect(new Date(depois.rows[0].atualizado_em).getTime()).toBeGreaterThanOrEqual(new Date(antes.rows[0].atualizado_em).getTime());

    // Não há grant de delete para authenticated (registro é auditoria)
    await expect(db.comoUsuario(comoSocioA, (c) => c.query("delete from public.divergencias_operacao where id = $1", [id]))).rejects.toThrow(/permission denied/);
  });

  it("ligações: apagar o prazo não apaga a divergência (fk set null)", async () => {
    const prazo = await comoServiceRole(async (c) => {
      const r = await c.query(
        `insert into public.prazos (escritorio_id, processo_id, origem, ato_descricao, data_final, responsavel_id)
         select p.escritorio_id, p.id, 'manual', 'Contestação', '2026-11-20', p.responsavel_id from public.processos p where p.id = $1 returning id`,
        [processoA],
      );
      return r.rows[0].id as string;
    });
    const id = await inserirDivergencia(comoAdvogadoA, { semana: "2026-11-13", prazo, processo: processoA, causa: "feriado da comarca faltando" });
    await comoServiceRole((c) => c.query("delete from public.prazos where id = $1", [prazo]));
    const r = await db.client.query("select prazo_id, processo_id from public.divergencias_operacao where id = $1", [id]);
    expect(r.rows[0]).toEqual({ prazo_id: null, processo_id: processoA });
  });

  it("marcar_prazos_vencidos_detalhado devolve id, processo e responsável; a RPC antiga segue devolvendo a contagem", async () => {
    const criarConfirmado = (dataFinal: string, processo: string) =>
      comoServiceRole(async (c) => {
        const r = await c.query(
          `insert into public.prazos (escritorio_id, processo_id, origem, ato_descricao, data_final, data_interna, responsavel_id, status, confirmado_em)
           select p.escritorio_id, p.id, 'manual', 'Contestação', $2, $2, p.responsavel_id, 'confirmado', now() from public.processos p where p.id = $1 returning id`,
          [processo, dataFinal],
        );
        return r.rows[0].id as string;
      });
    const prazoA = await criarConfirmado("2026-02-27", processoA);
    const prazoB = await criarConfirmado("2026-02-26", processoB);
    const futuro = await criarConfirmado("2026-12-10", processoA);

    await expect(db.comoUsuario(comoSocioA, (c) => c.query("select * from public.marcar_prazos_vencidos_detalhado('2026-03-01')"))).rejects.toThrow(/permission denied|Apenas o sistema/);

    const nada = await comoServiceRole(async (c) => (await c.query("select * from public.marcar_prazos_vencidos_detalhado('2026-02-26')")).rows);
    expect(nada).toEqual([]);

    const vencidos = await comoServiceRole(async (c) => (await c.query("select id, processo_id, responsavel_id from public.marcar_prazos_vencidos_detalhado('2026-02-28') order by processo_id")).rows);
    expect(vencidos).toHaveLength(2);
    expect(vencidos).toEqual(
      expect.arrayContaining([
        { id: prazoA, processo_id: processoA, responsavel_id: advogadoA },
        { id: prazoB, processo_id: processoB, responsavel_id: socioB },
      ]),
    );
    const status = await db.client.query("select id, status::text from public.prazos where id = any($1::uuid[]) order by data_final", [[prazoA, prazoB, futuro]]);
    expect(status.rows.map((r) => r.status)).toEqual(["vencido", "vencido", "confirmado"]);
    const eventos = await db.client.query("select prazo_id, de_status::text, para_status::text, usuario_id from public.prazos_eventos where tipo = 'vencido' and prazo_id = any($1::uuid[]) order by prazo_id", [[prazoA, prazoB]]);
    expect(eventos.rows).toEqual([{ prazo_id: prazoA, de_status: "confirmado", para_status: "vencido", usuario_id: null }, { prazo_id: prazoB, de_status: "confirmado", para_status: "vencido", usuario_id: null }].sort((a, b) => a.prazo_id.localeCompare(b.prazo_id)));

    // Idempotente: rodar de novo não devolve nada nem duplica eventos
    const deNovo = await comoServiceRole(async (c) => (await c.query("select * from public.marcar_prazos_vencidos_detalhado('2026-02-28')")).rows);
    expect(deNovo).toEqual([]);
    const totalEventos = await db.client.query("select count(*)::int as n from public.prazos_eventos where tipo = 'vencido' and prazo_id = any($1::uuid[])", [[prazoA, prazoB]]);
    expect(totalEventos.rows[0].n).toBe(2);

    // Compatibilidade: a função antiga ainda existe, com o mesmo retorno (int)
    const outro = await criarConfirmado("2026-03-01", processoA);
    const n = await comoServiceRole(async (c) => (await c.query("select public.marcar_prazos_vencidos('2026-03-02') as n")).rows[0].n);
    expect(n).toBe(1);
    expect((await db.client.query("select status::text from public.prazos where id = $1", [outro])).rows[0].status).toBe("vencido");
    await expect(db.comoUsuario(comoSocioA, (c) => c.query("select public.marcar_prazos_vencidos('2026-03-02')"))).rejects.toThrow(/permission denied|Apenas o sistema/);
  });
});
