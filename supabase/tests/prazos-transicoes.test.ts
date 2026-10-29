import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { montarCnj } from "../../src/lib/cnj/numero-cnj";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Migration 0021 (transições a partir de suspenso/prorrogado), contra docs/regras/estados.md:
 * 1. confirmado → suspenso → prorrogado → suspenso → confirmado (retomar_prazo) → cumprido, com evento a cada passo;
 * 2. estagiário negado em todas; prorrogar sem data falha; fundamento é obrigatório; data anterior é recusada;
 * 3. retomar só sai de suspenso; prazo suspenso não vence pelo job marcar_prazos_vencidos;
 * 4. a tarefa criada na confirmação segue o vencimento (data interna) e não é duplicada na retomada.
 */
describe("transições de prazo a partir de suspenso e prorrogado", () => {
  let db: BancoDeTeste;
  const escritorioA = "11111111-1111-4111-8111-111111111111";
  const socioA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const advogadoA = "abababab-abab-4bab-8bab-abababababab";
  const estagiarioA = "acacacac-acac-4cac-8cac-acacacacacac";
  const comoSocioA = { sub: socioA, escritorio_id: escritorioA, papel: "socio" };
  const comoAdvogadoA = { sub: advogadoA, escritorio_id: escritorioA, papel: "advogado" };
  const comoEstagiarioA = { sub: estagiarioA, escritorio_id: escritorioA, papel: "estagiario" };

  let processoA: string;
  let prazo: string;
  let prazoVencimento: string;

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

  const inserirPrazo = (dataFinal: string) =>
    comoServiceRole(async (c) => {
      const r = await c.query(
        `insert into public.prazos (escritorio_id, processo_id, origem, ato_descricao, quantidade, data_final, data_interna, data_sugerida_ia, memoria_calculo, responsavel_id)
         select p.escritorio_id, p.id, 'manual', 'Contestação', 15, $2, $2, $2, '{"regra": "teste"}'::jsonb, p.responsavel_id
           from public.processos p where p.id = $1
         returning id`,
        [processoA, dataFinal],
      );
      return r.rows[0].id as string;
    });

  const estado = async (id: string) => {
    const { rows } = await db.client.query("select status::text, data_final::text, data_interna::text, data_confirmada::text from public.prazos where id = $1", [id]);
    return rows[0] as { status: string; data_final: string; data_interna: string | null; data_confirmada: string | null };
  };

  const eventos = async (id: string) => {
    const { rows } = await db.client.query("select tipo, de_status::text, para_status::text, usuario_id, dados from public.prazos_eventos where prazo_id = $1 order by criado_em, tipo", [id]);
    return rows as { tipo: string; de_status: string | null; para_status: string; usuario_id: string | null; dados: Record<string, unknown> }[];
  };

  beforeAll(async () => {
    db = await subirBancoDeTeste();
    const c = db.client;
    for (const [id, email] of [
      [socioA, "socio.a@teste.local"],
      [advogadoA, "adv.a@teste.local"],
      [estagiarioA, "est.a@teste.local"],
    ]) {
      await c.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
    }
    await c.query("insert into public.escritorios (id, nome) values ($1, 'Escritório A')", [escritorioA]);
    await c.query(
      `insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, oab_numero, oab_uf)
       values ($1, $2, 'socio.a@teste.local', 'socio', 'Sócia A', '20817', 'MT'),
              ($1, $3, 'adv.a@teste.local', 'advogado', 'Advogado A', '30000', 'MT'),
              ($1, $4, 'est.a@teste.local', 'estagiario', 'Estagiário A', null, null)`,
      [escritorioA, socioA, advogadoA, estagiarioA],
    );
    const proc = await c.query("insert into public.processos (escritorio_id, numero_cnj, responsavel_id) values ($1, $2, $3) returning id", [escritorioA, montarCnj(300, 2025, 8, "11", "0041"), advogadoA]);
    processoA = proc.rows[0].id;
    prazo = await inserirPrazo("2026-04-10");
    prazoVencimento = await inserirPrazo("2026-03-02");
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  it("confirmado → suspenso (sem nova data) pelo advogado responsável, com evento e fundamento", async () => {
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.confirmar_prazo($1)", [prazo]));
    expect((await estado(prazo)).status).toBe("confirmado");
    const tarefas = await db.client.query("select id, vencimento::text, status::text from public.tarefas where prazo_id = $1", [prazo]);
    expect(tarefas.rows).toHaveLength(1);

    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.suspender_ou_prorrogar_prazo($1, 'suspenso', null, 'Portaria TJMT nº 1/2026: suspensão dos prazos')", [prazo]));
    const s = await estado(prazo);
    expect(s.status).toBe("suspenso");
    expect(s.data_final).toBe("2026-04-10");
    const ev = (await eventos(prazo)).at(-1)!;
    expect(ev).toMatchObject({ tipo: "suspenso", de_status: "confirmado", para_status: "suspenso", usuario_id: advogadoA });
    expect(ev.dados.fundamento).toBe("Portaria TJMT nº 1/2026: suspensão dos prazos");
  });

  it("suspenso não vence pelo job marcar_prazos_vencidos; retomar exige fundamento e não aceita data anterior", async () => {
    const vencidos = await comoServiceRole(async (c) => (await c.query("select public.marcar_prazos_vencidos('2026-12-31'::date) as n")).rows[0].n as number);
    expect(vencidos).toBe(0);
    expect((await estado(prazo)).status).toBe("suspenso");

    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.retomar_prazo($1, null, '  ')", [prazo]))).rejects.toThrow(/exige fundamento/);
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.retomar_prazo($1, '2026-04-01', 'decisão')", [prazo]))).rejects.toThrow(/não pode ser anterior/);
    // Suspender de novo sem nova data é um no-op recusado
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.suspender_ou_prorrogar_prazo($1, 'suspenso', null, 'de novo')", [prazo]))).rejects.toThrow(/já está suspenso/);
  });

  it("suspenso → prorrogado com nova data recalcula a data interna e move o vencimento da tarefa", async () => {
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.suspender_ou_prorrogar_prazo($1, 'prorrogado', null, 'decisão de 10/04')", [prazo]))).rejects.toThrow(/exige a nova data/);
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.suspender_ou_prorrogar_prazo($1, 'prorrogado', '2026-04-24', null)", [prazo]))).rejects.toThrow(/exige fundamento/);

    await db.comoUsuario(comoSocioA, (c) => c.query("select public.suspender_ou_prorrogar_prazo($1, 'prorrogado', '2026-04-24', 'Decisão de 10/04: prazo devolvido por 10 dias')", [prazo]));
    const s = await estado(prazo);
    expect(s.status).toBe("prorrogado");
    expect(s.data_final).toBe("2026-04-24");
    // 2 dias úteis de segurança antes de 24/04/2026 (sexta) = 22/04 (quarta); 21/04 é feriado nacional (Tiradentes)
    expect(s.data_interna).toBe("2026-04-22");
    const tarefa = await db.client.query("select vencimento::text, status::text from public.tarefas where prazo_id = $1", [prazo]);
    expect(tarefa.rows[0]).toEqual({ vencimento: "2026-04-22", status: "a_fazer" });
    const ev = (await eventos(prazo)).at(-1)!;
    expect(ev).toMatchObject({ tipo: "prorrogado", de_status: "suspenso", para_status: "prorrogado", usuario_id: socioA });
    expect(ev.dados).toMatchObject({ data_anterior: "2026-04-10", data_final: "2026-04-24", data_interna: "2026-04-22" });
  });

  it("prorrogado → suspenso → confirmado (retomar_prazo, com nova data) → cumprido; retomar não duplica a tarefa", async () => {
    // retomar só sai de suspenso
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.retomar_prazo($1, null, 'decisão')", [prazo]))).rejects.toThrow(/não permitida: prorrogado/);

    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.suspender_ou_prorrogar_prazo($1, 'suspenso', null, 'Portaria TJMT nº 2/2026')", [prazo]));
    expect((await estado(prazo)).status).toBe("suspenso");

    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.retomar_prazo($1, '2026-05-08', 'Fim da suspensão: Portaria TJMT nº 3/2026')", [prazo]));
    const s = await estado(prazo);
    expect(s.status).toBe("confirmado");
    expect(s.data_final).toBe("2026-05-08");
    expect(s.data_confirmada).toBe("2026-05-08");
    // 2 dias úteis antes de 08/05/2026 (sexta) = 06/05 (quarta)
    expect(s.data_interna).toBe("2026-05-06");
    const ev = (await eventos(prazo)).at(-1)!;
    expect(ev).toMatchObject({ tipo: "retomado", de_status: "suspenso", para_status: "confirmado", usuario_id: advogadoA });
    expect(ev.dados).toMatchObject({ fundamento: "Fim da suspensão: Portaria TJMT nº 3/2026", data_anterior: "2026-04-24", data_final: "2026-05-08", data_interna: "2026-05-06" });

    const tarefas = await db.client.query("select vencimento::text, status::text from public.tarefas where prazo_id = $1", [prazo]);
    expect(tarefas.rows).toEqual([{ vencimento: "2026-05-06", status: "a_fazer" }]);

    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.cumprir_prazo($1, 'manual')", [prazo]));
    expect((await estado(prazo)).status).toBe("cumprido");
    expect((await eventos(prazo)).map((e) => e.tipo)).toEqual(["criado", "confirmado", "suspenso", "prorrogado", "suspenso", "retomado", "cumprido"]);
  });

  it("retomar sem nova data mantém as datas; a partir de confirmado é recusado", async () => {
    const outro = await inserirPrazo("2026-06-12");
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.confirmar_prazo($1)", [outro]));
    await expect(db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.retomar_prazo($1, null, 'decisão')", [outro]))).rejects.toThrow(/não permitida: confirmado/);
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.suspender_ou_prorrogar_prazo($1, 'suspenso', null, 'Portaria')", [outro]));
    const antes = await estado(outro);
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.retomar_prazo($1, null, 'Fim da suspensão')", [outro]));
    const depois = await estado(outro);
    expect(depois).toEqual({ ...antes, status: "confirmado" });
  });

  it("estagiário não suspende, prorroga nem retoma", async () => {
    const outro = await inserirPrazo("2026-07-10");
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.confirmar_prazo($1)", [outro]));
    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.suspender_ou_prorrogar_prazo($1, 'suspenso', null, 'Portaria')", [outro]))).rejects.toThrow(/Apenas o advogado responsável/);
    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.suspender_ou_prorrogar_prazo($1, 'prorrogado', '2026-07-20', 'decisão')", [outro]))).rejects.toThrow(/Apenas o advogado responsável/);
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.suspender_ou_prorrogar_prazo($1, 'suspenso', null, 'Portaria')", [outro]));
    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.retomar_prazo($1, null, 'decisão')", [outro]))).rejects.toThrow(/Apenas o advogado responsável/);
    expect((await estado(outro)).status).toBe("suspenso");
  });

  it("prorrogado continua vencendo pelo job; o suspenso não", async () => {
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.confirmar_prazo($1)", [prazoVencimento]));
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.suspender_ou_prorrogar_prazo($1, 'prorrogado', '2026-03-09', 'decisão')", [prazoVencimento]));
    const n = await comoServiceRole(async (c) => (await c.query("select public.marcar_prazos_vencidos('2026-03-10'::date) as n")).rows[0].n as number);
    expect(n).toBe(1);
    expect((await estado(prazoVencimento)).status).toBe("vencido");
    // O prazo suspenso do teste anterior ficou intacto
    const suspensos = await db.client.query("select count(*)::int as n from public.prazos where status = 'suspenso'");
    expect(suspensos.rows[0].n).toBe(1);
  });
});
