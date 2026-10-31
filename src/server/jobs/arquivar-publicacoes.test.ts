import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { arquivarPublicacoes, corteDoArquivamento, DIAS_ATE_ARQUIVAR, LOTE_ARQUIVAMENTO } from "./arquivar-publicacoes";

const ESC = "11111111-1111-4111-8111-111111111111";
const AGORA = new Date("2026-10-31T05:00:00.000Z");
const CORTE = "2026-10-01T05:00:00.000Z";

type Linha = Record<string, unknown>;

/**
 * Admin falso: `publicacoes` responde à consulta do job (eq, in, or por tratada_em/atualizado_em, limit);
 * `escritorios` e `jobs_execucoes` ao registro; a RPC pode falhar por id.
 */
function criarAdminFalso(publicacoes: Linha[], opcoes: { falharIds?: string[] } = {}) {
  const execucoes: Linha[] = [];
  const rpcs: { nome: string; args: Linha }[] = [];
  const filtrosOr: string[] = [];

  const consulta = (tabela: string) => {
    const filtros: ((l: Linha) => boolean)[] = [];
    let limite = Infinity;
    let patch: Linha | null = null;
    let inserir: Linha | null = null;
    const resolver = () => {
      if (tabela === "escritorios") return { data: [{ id: ESC, nome: "Escritório A", timezone: "America/Cuiaba" }], error: null };
      if (tabela === "jobs_execucoes") {
        if (inserir) {
          const nova = { id: `exec-${execucoes.length + 1}`, ...inserir };
          execucoes.push(nova);
          return { data: nova, error: null };
        }
        for (const e of execucoes.filter((l) => filtros.every((f) => f(l)))) Object.assign(e, patch);
        return { data: null, error: null };
      }
      const linhas = publicacoes.filter((l) => filtros.every((f) => f(l))).slice(0, limite);
      return { data: linhas, error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => {
        filtros.push((l) => l[c] === v);
        return q;
      },
      in: (c: string, v: unknown[]) => {
        filtros.push((l) => v.includes(l[c]));
        return q;
      },
      or: (expr: string) => {
        filtrosOr.push(expr);
        const corte = /tratada_em\.lt\.([^,]+),and\(tratada_em\.is\.null,atualizado_em\.lt\.([^)]+)\)/.exec(expr);
        if (!corte) throw new Error(`filtro or inesperado: ${expr}`);
        filtros.push((l) => (l.tratada_em ? String(l.tratada_em) < corte[1] : String(l.atualizado_em) < corte[2]));
        return q;
      },
      limit: (n: number) => {
        limite = n;
        return q;
      },
      insert: (linha: Linha) => {
        inserir = linha;
        return q;
      },
      update: (p: Linha) => {
        patch = p;
        return q;
      },
      single: async () => resolver(),
      then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, ko),
    };
    return q;
  };

  const admin = {
    from: (tabela: string) => consulta(tabela),
    rpc: async (nome: string, args: Linha) => {
      rpcs.push({ nome, args });
      if (opcoes.falharIds?.includes(String(args.p_id))) return { data: null, error: { message: "Transição de publicação não permitida" } };
      const pub = publicacoes.find((p) => p.id === args.p_id);
      if (pub) pub.status = args.p_para;
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;

  return { admin, execucoes, rpcs, filtrosOr };
}

const pub = (id: string, status: string, tratadaEm: string | null, atualizadoEm = tratadaEm ?? "2026-10-30T00:00:00.000Z"): Linha => ({
  id,
  escritorio_id: ESC,
  status,
  tratada_em: tratadaEm,
  atualizado_em: atualizadoEm,
});

describe("corteDoArquivamento", () => {
  it("é 30 dias antes de agora, em ISO", () => {
    expect(DIAS_ATE_ARQUIVAR).toBe(30);
    expect(corteDoArquivamento(AGORA)).toBe(CORTE);
    expect(corteDoArquivamento(AGORA, 1)).toBe("2026-10-30T05:00:00.000Z");
  });
});

describe("arquivarPublicacoes", () => {
  it("arquiva pela RPC só os estados finais com mais de 30 dias e registra a execução", async () => {
    const { admin, execucoes, rpcs, filtrosOr } = criarAdminFalso([
      pub("tratada-velha", "tratada", "2026-09-15T12:00:00.000Z"),
      pub("ignorada-velha", "ignorada", "2026-08-01T12:00:00.000Z"),
      pub("duplicada-velha", "duplicada", "2026-09-30T12:00:00.000Z"),
      pub("sem-tratada-em", "tratada", null, "2026-09-01T12:00:00.000Z"),
      pub("tratada-recente", "tratada", "2026-10-20T12:00:00.000Z"),
      pub("no-limite", "tratada", "2026-10-01T05:00:00.000Z"),
      pub("sem-prazo-velha", "sem_prazo", "2026-08-01T12:00:00.000Z"),
      pub("nova", "nova", null, "2026-08-01T12:00:00.000Z"),
      pub("ja-arquivada", "arquivada", "2026-08-01T12:00:00.000Z"),
      { ...pub("outro-escritorio", "tratada", "2026-08-01T12:00:00.000Z"), escritorio_id: "22222222-2222-4222-8222-222222222222" },
    ]);

    const resumo = await arquivarPublicacoes(admin, { agora: AGORA });

    expect(resumo).toEqual([
      { escritorio: "Escritório A", ok: true, execucaoId: "exec-1", itens: 4, erro: null, detalhes: { corte: CORTE, candidatas: 4, loteCheio: false } },
    ]);
    expect(filtrosOr).toEqual([`tratada_em.lt.${CORTE},and(tratada_em.is.null,atualizado_em.lt.${CORTE})`]);
    expect(rpcs.map((r) => r.args.p_id).sort()).toEqual(["duplicada-velha", "ignorada-velha", "sem-tratada-em", "tratada-velha"]);
    for (const r of rpcs) {
      expect(r.nome).toBe("transicionar_publicacao");
      expect(r.args.p_para).toBe("arquivada");
      expect(r.args.p_dados).toMatchObject({ origem: "rotina", dias: 30, corte: CORTE });
      expect(r.args.p_dados).not.toHaveProperty("motivo");
    }
    expect(execucoes).toEqual([expect.objectContaining({ job: "arquivar-publicacoes", escritorio_id: ESC, status: "ok", itens: 4 })]);
  });

  it("sem candidatas, registra execução com zero itens e não chama a RPC", async () => {
    const { admin, execucoes, rpcs } = criarAdminFalso([pub("recente", "tratada", "2026-10-25T12:00:00.000Z")]);
    const resumo = await arquivarPublicacoes(admin, { agora: AGORA });
    expect(resumo[0]).toMatchObject({ ok: true, itens: 0 });
    expect(rpcs).toEqual([]);
    expect(execucoes[0]).toMatchObject({ status: "ok", itens: 0 });
  });

  it("falha da RPC numa publicação não impede as demais; a execução fica em erro com a contagem", async () => {
    const { admin, execucoes, rpcs } = criarAdminFalso(
      [pub("a", "tratada", "2026-09-01T12:00:00.000Z"), pub("b", "ignorada", "2026-09-02T12:00:00.000Z"), pub("c", "duplicada", "2026-09-03T12:00:00.000Z")],
      { falharIds: ["b"] },
    );
    const resumo = await arquivarPublicacoes(admin, { agora: AGORA });
    expect(rpcs).toHaveLength(3);
    expect(resumo[0]).toMatchObject({ ok: false, itens: 0 });
    expect(resumo[0].erro).toMatch(/1 de 3 publicações não arquivadas \(2 arquivadas\); primeira: b: Transição/);
    expect(execucoes[0]).toMatchObject({ status: "erro" });
    expect(String(execucoes[0].erro)).toContain("1 de 3");
  });

  it("respeita o lote por execução e avisa que ficou mais para o dia seguinte", async () => {
    const muitas = Array.from({ length: LOTE_ARQUIVAMENTO + 3 }, (_, i) => pub(`p-${i}`, "tratada", "2026-09-01T12:00:00.000Z"));
    const { admin, rpcs } = criarAdminFalso(muitas);
    const resumo = await arquivarPublicacoes(admin, { agora: AGORA });
    expect(rpcs).toHaveLength(LOTE_ARQUIVAMENTO);
    expect(resumo[0]).toMatchObject({ ok: true, itens: LOTE_ARQUIVAMENTO, detalhes: { candidatas: LOTE_ARQUIVAMENTO, loteCheio: true } });
  });
});
