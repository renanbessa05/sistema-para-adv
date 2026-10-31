import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClienteIa } from "@/lib/ia";
import { AVISO_SIGILOSO } from "@/lib/whatsapp";
import type { ContextoEscritorio } from "../../notificacoes";
import { criarAdminFalso } from "./admin-falso";

const enfileirarEvento = vi.fn(async () => 1);
const CTX: ContextoEscritorio = { id: "esc-1", timezone: "America/Cuiaba", membros: [], telefones: new Map(), emails: new Map(), ausencias: [], feriados: [] };
const classificacao = { tipo: "intimacao", resumo_simples: "Intimação para manifestação em 15 dias.", sugere_sigilo: false, confianca: 0.92, gera_prazo: false };
const classificarPublicacao = vi.fn(async () => ({ dados: { ...classificacao }, numeroCnjValidado: null as string | null }));

vi.mock("../registro", () => ({
  executarJob: async (_admin: unknown, _nome: string, fn: () => Promise<{ itens: number; detalhes?: Record<string, unknown> }>) => {
    const r = await fn();
    return { ok: true, execucaoId: "exec-1", itens: r.itens, erro: null, detalhes: r.detalhes };
  },
  listarEscritoriosAtivos: async () => [{ id: "esc-1", nome: "Escritório Teste", timezone: "America/Cuiaba" }],
}));
vi.mock("../../notificacoes", () => ({ carregarContexto: async () => CTX, enfileirarEvento: (...args: unknown[]) => enfileirarEvento(...(args as [])) }));
vi.mock("../../ia/executar", () => ({
  clienteIaDoAmbiente: () => null,
  executarAgente: async (ctx: { cliente: unknown }, fn: (c: unknown, m: string) => Promise<unknown>) => ({ resultado: await fn(ctx.cliente, "modelo-teste"), execucaoId: "exec-ia-1" }),
}));
vi.mock("../../ia/teto", () => ({ verificarTeto: async () => ({ atingido: false, gastoUsd: 0, tetoUsd: 50 }) }));
vi.mock("../../prazos", () => ({ sugerirPrazo: async () => ({ id: "prazo-1" }) }));
vi.mock("@/lib/ia", () => ({ classificarPublicacao: (...args: unknown[]) => classificarPublicacao(...(args as [])), ErroIa: class ErroIa extends Error {} }));
vi.mock("@/lib/config/env", () => ({ envServidor: () => ({ APP_URL: "https://painel.teste" }) }));

const { classificarPendentes, notificarNovaPublicacao } = await import("../classificar");

const cliente = {} as ClienteIa;

function banco(opcoes: { segredo?: boolean; responsavel?: string | null } = {}) {
  return {
    escritorio_membros: [{ escritorio_id: "esc-1", nome_completo: "Ana Advogada", oab_numero: "12345", oab_uf: "MT", ativo: true }],
    processos: [{ id: "proc-1", escritorio_id: "esc-1", numero_cnj: "00012345620268110041", numero_cnj_mascara: "0001234-56.2026.8.11.0041", segredo_justica: opcoes.segredo ?? false, responsavel_id: opcoes.responsavel === undefined ? "adv-1" : opcoes.responsavel }],
    publicacoes: [
      { id: "pub-vinculada", escritorio_id: "esc-1", processo_id: "proc-1", texto: "Texto da intimação", tipo_origem: "Intimação", orgao: null, classe: null, data_disponibilizacao: "2026-10-28", numero_cnj: "00012345620268110041", tribunal_id: null, status: "nova", cancelada: false },
      { id: "pub-solta", escritorio_id: "esc-1", processo_id: null, texto: "Outro texto", tipo_origem: "Intimação", orgao: null, classe: null, data_disponibilizacao: "2026-10-28", numero_cnj: null, tribunal_id: null, status: "nova", cancelada: false },
    ],
  };
}

type Chamada = { evento: string; objeto: { tipo: string; id: string }; responsavelId?: string; variaveis: Record<string, string> };
const chamadas = () => enfileirarEvento.mock.calls.map((c) => (c as unknown[])[2] as Chamada);

beforeEach(() => {
  enfileirarEvento.mockClear();
  classificarPublicacao.mockClear();
});

describe("nova_publicacao no job classificar", () => {
  it("publicação vinculada → evento ao responsável do processo, com link /publicacoes/[id] e resumo curto; solta → só publicacao_sem_processo", async () => {
    const { admin, banco: dados } = criarAdminFalso(banco());
    const [r] = await classificarPendentes(admin, { cliente });
    expect(r.ok).toBe(true);
    expect(r.detalhes).toMatchObject({ classificadas: 2, semProcesso: 1, notificadas: 1, erros: [] });

    const eventos = chamadas();
    expect(eventos.map((e) => [e.evento, e.objeto.id])).toEqual([
      ["nova_publicacao", "pub-vinculada"],
      ["publicacao_sem_processo", "pub-solta"],
    ]);
    const nova = eventos[0];
    expect(nova.objeto).toEqual({ tipo: "publicacao", id: "pub-vinculada" });
    expect(nova.responsavelId).toBe("adv-1");
    expect(nova.variaveis["1"]).toBe("0001234-56.2026.8.11.0041");
    expect(nova.variaveis["2"]).toBe("Intimação de 28/10/2026");
    expect(nova.variaveis["3"]).toBe("Intimação para manifestação em 15 dias.");
    expect(nova.variaveis["4"]).toBe("https://painel.teste/publicacoes/pub-vinculada");
    expect(nova.variaveis.link).toBe("https://painel.teste/publicacoes/pub-vinculada");
    expect(nova.variaveis.texto).toContain("Intimação para manifestação em 15 dias.");
    expect(nova.variaveis.texto).toContain("https://painel.teste/publicacoes/pub-vinculada");

    // A publicação saiu de `nova`: rodar o job de novo não a reprocessa (e a chave_dedup barraria a mesma notificação no mesmo dia).
    expect(dados.publicacoes.find((p) => p.id === "pub-vinculada")?.status).toBe("sem_prazo");
    enfileirarEvento.mockClear();
    await classificarPendentes(admin, { cliente });
    expect(enfileirarEvento).not.toHaveBeenCalled();
  });

  it("vincula pelo CNJ validado quando a captação não vinculou e ainda assim avisa o responsável", async () => {
    const dados = banco();
    dados.publicacoes = [{ ...dados.publicacoes[1], id: "pub-por-cnj" }];
    classificarPublicacao.mockResolvedValueOnce({ dados: { ...classificacao }, numeroCnjValidado: "00012345620268110041" });
    const { admin } = criarAdminFalso(dados);
    await classificarPendentes(admin, { cliente });
    const eventos = chamadas();
    expect(eventos).toHaveLength(1);
    expect(eventos[0].evento).toBe("nova_publicacao");
    expect(eventos[0].responsavelId).toBe("adv-1");
  });

  it("processo em segredo de justiça: variáveis e texto sem o resumo", async () => {
    const { admin } = criarAdminFalso(banco({ segredo: true }));
    const n = await notificarNovaPublicacao(admin, CTX, "https://painel.teste", { id: "pub-vinculada", processoId: "proc-1", tipoOrigem: "Intimação", dataDisponibilizacao: "2026-10-28", resumo: "Resumo que não pode vazar", sugereSigilo: false });
    expect(n).toBe(1);
    const [e] = chamadas();
    expect(e.variaveis["3"]).toBe(AVISO_SIGILOSO);
    expect(e.variaveis.texto).not.toContain("Resumo que não pode vazar");
    expect(e.variaveis.texto).toContain("0001234-56.2026.8.11.0041");
  });

  it("IA sugerindo sigilo também oculta o resumo; sem responsável, responsavelId fica indefinido (a regra manda aos sócios)", async () => {
    const { admin } = criarAdminFalso(banco({ responsavel: null }));
    await notificarNovaPublicacao(admin, CTX, "https://painel.teste", { id: "pub-vinculada", processoId: "proc-1", tipoOrigem: null, dataDisponibilizacao: null, resumo: "Segredo", sugereSigilo: true });
    const [e] = chamadas();
    expect(e.responsavelId).toBeUndefined();
    expect(e.variaveis["2"]).toBe("DJEN");
    expect(e.variaveis["3"]).toBe(AVISO_SIGILOSO);
    expect(e.variaveis.texto).not.toContain("Segredo");
  });
});
