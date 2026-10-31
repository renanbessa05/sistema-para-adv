import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextoEscritorio } from "../../notificacoes";
import { criarAdminFalso } from "./admin-falso";

const enfileirarEvento = vi.fn(async () => 1);
const CTX: ContextoEscritorio = { id: "esc-1", timezone: "America/Cuiaba", membros: [], telefones: new Map(), emails: new Map(), ausencias: [], feriados: [] };

vi.mock("../registro", () => ({
  executarJob: async (_admin: unknown, _nome: string, fn: () => Promise<{ itens: number; detalhes?: Record<string, unknown> }>) => {
    const r = await fn();
    return { ok: true, execucaoId: "exec-1", itens: r.itens, erro: null, detalhes: r.detalhes };
  },
  listarEscritoriosAtivos: async () => [{ id: "esc-1", nome: "Escritório Teste", timezone: "America/Cuiaba" }],
}));
vi.mock("../../notificacoes", () => ({ carregarContexto: async () => CTX, enfileirarEvento: (...args: unknown[]) => enfileirarEvento(...(args as [])) }));
vi.mock("@/lib/config/env", () => ({ envServidor: () => ({ APP_URL: "https://painel.teste" }) }));

const { alertasDePrazo, alertasDeTarefaAtrasada } = await import("../alertas");

// Quinta, 29/10/2026, 07:00 em Cuiabá (11:00 UTC): horário do cron alertas-prazo.
const AGORA = new Date("2026-10-29T11:00:00Z");
const HOJE = "2026-10-29";

function banco() {
  return {
    prazos: [],
    tarefas: [
      { id: "t-atrasada", escritorio_id: "esc-1", titulo: "Juntar procuração", vencimento: "2026-10-27", status: "a_fazer", executor_id: "est-1", responsavel_id: "adv-1", processos: { numero_cnj_mascara: "0001234-56.2026.8.11.0041" } },
      { id: "t-sem-executor", escritorio_id: "esc-1", titulo: "Ligar para o cliente", vencimento: "2026-10-28", status: "em_andamento", executor_id: null, responsavel_id: "adv-1", processos: null },
      { id: "t-hoje", escritorio_id: "esc-1", titulo: "Vence hoje, não está atrasada", vencimento: HOJE, status: "a_fazer", executor_id: "est-1", responsavel_id: "adv-1", processos: null },
      { id: "t-concluida", escritorio_id: "esc-1", titulo: "Já feita", vencimento: "2026-10-20", status: "concluida", executor_id: "est-1", responsavel_id: "adv-1", processos: null },
      { id: "t-cancelada", escritorio_id: "esc-1", titulo: "Cancelada", vencimento: "2026-10-20", status: "cancelada", executor_id: "est-1", responsavel_id: "adv-1", processos: null },
      { id: "t-sem-vencimento", escritorio_id: "esc-1", titulo: "Sem data", vencimento: null, status: "a_fazer", executor_id: "est-1", responsavel_id: "adv-1", processos: null },
      { id: "t-outro-escritorio", escritorio_id: "esc-2", titulo: "De outro tenant", vencimento: "2026-10-01", status: "a_fazer", executor_id: "x", responsavel_id: "x", processos: null },
    ],
  };
}

type Chamada = { evento: string; objeto: { tipo: string; id: string }; responsavelId?: string; agora?: Date; variaveis: Record<string, string> };
const chamadas = () => enfileirarEvento.mock.calls.map((c) => (c as unknown[])[2] as Chamada);

beforeEach(() => enfileirarEvento.mockClear());

describe("tarefa_atrasada", () => {
  it("emite para tarefas abertas com vencimento < hoje, ao executor, com link /tarefas/[id]", async () => {
    const { admin } = criarAdminFalso(banco());
    const r = await alertasDeTarefaAtrasada(admin, CTX, { hoje: HOJE, appUrl: "https://painel.teste", agora: AGORA });
    expect(r).toEqual({ avaliadas: 2, enfileiradas: 2 });

    const lista = chamadas();
    expect(lista.map((c) => c.evento)).toEqual(["tarefa_atrasada", "tarefa_atrasada"]);

    const atrasada = lista[0];
    expect(atrasada.objeto).toEqual({ tipo: "tarefa", id: "t-atrasada" });
    expect(atrasada.responsavelId).toBe("est-1");
    expect(atrasada.agora).toBe(AGORA);
    expect(atrasada.variaveis.link).toBe("https://painel.teste/tarefas/t-atrasada");
    expect(atrasada.variaveis.dias_atraso).toBe("2");
    expect(atrasada.variaveis.texto).toContain("Juntar procuração");
    expect(atrasada.variaveis.texto).toContain("0001234-56.2026.8.11.0041");
    expect(atrasada.variaveis.texto).toContain("27/10/2026");
    expect(atrasada.variaveis.texto).toContain("https://painel.teste/tarefas/t-atrasada");

    // Sem executor, o responsável da tarefa recebe.
    expect(lista[1].responsavelId).toBe("adv-1");
  });

  it("rodar de novo no mesmo dia produz as mesmas chamadas (a chave_dedup do enfileirar cuida da repetição)", async () => {
    const { admin } = criarAdminFalso(banco());
    await alertasDeTarefaAtrasada(admin, CTX, { hoje: HOJE, appUrl: "https://painel.teste", agora: AGORA });
    const primeira = chamadas().map((c) => ({ ...c, agora: undefined }));
    enfileirarEvento.mockClear();
    await alertasDeTarefaAtrasada(admin, CTX, { hoje: HOJE, appUrl: "https://painel.teste", agora: new Date(AGORA.getTime() + 3_600_000) });
    const segunda = chamadas().map((c) => ({ ...c, agora: undefined }));
    expect(segunda).toEqual(primeira);
  });

  it("entra no job alertas-prazo: itens soma prazos e tarefas; detalhes traz tarefasAtrasadas", async () => {
    const { admin } = criarAdminFalso(banco());
    const [r] = await alertasDePrazo(admin, { agora: AGORA });
    expect(r.ok).toBe(true);
    expect(r.itens).toBe(2);
    expect(r.detalhes).toMatchObject({ prazosAvaliados: 0, tarefasAtrasadas: 2, hoje: HOJE });
    expect(chamadas().every((c) => c.evento === "tarefa_atrasada")).toBe(true);
  });
});
