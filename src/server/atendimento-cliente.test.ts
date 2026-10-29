import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClienteIa } from "@/lib/ia";
import type { ClienteWhatsapp, MensagemRecebida } from "@/lib/whatsapp";
import { atenderCliente, enviarMensagensCliente, identificarCliente } from "./atendimento-cliente";

// Sem banco: o executor de IA e as notificações são substituídos; o admin é um fake que registra escritas.
vi.mock("./ia/executar", () => ({
  executarAgente: async (ctx: { cliente: unknown }, fn: (c: unknown, m: string) => Promise<unknown>) => {
    const resultado = await fn(ctx.cliente, "modelo-teste");
    return { resultado, execucaoId: "exec-1", uso: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }, modelo: "modelo-teste" };
  },
}));
vi.mock("./notificacoes", () => ({ carregarContexto: async () => ({}), enfileirarEvento: async () => 1 }));
vi.mock("./integracoes", () => ({ clienteWhatsappDoEscritorio: async () => null }));

type Linha = Record<string, unknown>;

/** Admin falso mínimo: filtros por igualdade, inserts com id, updates e RPCs registradas. */
function criarAdminFalso(banco: Record<string, Linha[]>, rpcs: Record<string, (args: Linha) => unknown> = {}) {
  const escritas = { inserts: [] as { tabela: string; linha: Linha }[], updates: [] as { tabela: string; patch: Linha }[], rpcs: [] as { nome: string; args: Linha }[] };
  let seq = 1;

  const consulta = (tabela: string) => {
    const filtros: ((l: Linha) => boolean)[] = [];
    let patch: Linha | null = null;
    let inserir: Linha | null = null;
    const resolver = () => {
      if (inserir) {
        const nova = { id: `id-${seq++}`, ...inserir };
        (banco[tabela] ??= []).push(nova);
        escritas.inserts.push({ tabela, linha: nova });
        return { data: nova, error: null, count: null };
      }
      const linhas = (banco[tabela] ?? []).filter((l) => filtros.every((f) => f(l)));
      if (patch) {
        for (const l of linhas) Object.assign(l, patch);
        escritas.updates.push({ tabela, patch });
        return { data: null, error: null, count: null };
      }
      return { data: linhas, error: null, count: linhas.length };
    };
    const q: Record<string, unknown> = {
      select: () => q,
      order: () => q,
      limit: () => q,
      gte: () => q,
      not: () => q,
      is: () => q,
      eq: (c: string, v: unknown) => {
        filtros.push((l) => l[c] === v);
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
      maybeSingle: async () => {
        const r = resolver();
        return { ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data };
      },
      single: async () => {
        const r = resolver();
        return { ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data };
      },
      then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, ko),
    };
    return q;
  };

  const admin = {
    from: (tabela: string) => consulta(tabela),
    rpc: async (nome: string, args: Linha) => {
      escritas.rpcs.push({ nome, args });
      const impl = rpcs[nome];
      return { data: impl ? impl(args) : null, error: null };
    },
  };
  return { admin: admin as unknown as SupabaseClient, banco, escritas };
}

const TELEFONE = "+5565999990000";
const AGORA = new Date(Date.UTC(2026, 9, 29, 16, 0)); // quinta, 12:00 em Cuiabá

function whatsappFalso() {
  return {
    enviarTexto: vi.fn(async () => ({ ok: true as const, wamid: "w-texto" })),
    enviarTemplate: vi.fn(async () => ({ ok: true as const, wamid: "w-template" })),
    marcarComoLida: vi.fn(async () => ({ ok: true as const, wamid: "w-lida" })),
  };
}

function iaFalsa(intent: string, rascunho = { texto: "Rascunho da resposta", depende_de_advogado: false }) {
  const gerarEstruturado = vi.fn(async (p: { agente: string }) => ({
    dados: p.agente === "roteador_cliente" ? { intent, confianca: 0.9 } : rascunho,
    uso: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
    modelo: "modelo-teste",
    latenciaMs: 1,
    requestId: null,
    stopReason: null,
  }));
  return { cliente: { gerarEstruturado } as unknown as ClienteIa, gerarEstruturado };
}

function mensagemDoCliente(texto: string): MensagemRecebida {
  return { wamid: `wamid-${texto}`, telefone_e164: TELEFONE, texto, tipo: "texto", timestamp: AGORA.toISOString(), payload_bruto: {} } as unknown as MensagemRecebida;
}

/** Banco de um escritório com um cliente verificado e autorizado. */
function bancoBase(opcoes: { envioAtivo: boolean; horario?: boolean; sigiloso?: boolean; optOut?: boolean; processos?: number }) {
  const processoId = "proc-1";
  return {
    escritorios: [{ id: "esc-1", nome: "Escritório Teste", timezone: "America/Cuiaba" }],
    clientes: [{ id: "cli-1", nome: "Cliente Teste" }],
    clientes_contatos: [
      { id: "ct-1", escritorio_id: "esc-1", cliente_id: "cli-1", telefone_e164: TELEFONE, ativo: true, verificado_em: "2026-10-01", opt_in_em: "2026-10-01", opt_out_em: opcoes.optOut ? "2026-10-02" : null },
    ],
    regras_atendimento: [
      {
        escritorio_id: "esc-1",
        envio_ativo: opcoes.envioAtivo,
        horario_inicio: opcoes.horario === false ? null : "08:00:00",
        horario_fim: opcoes.horario === false ? null : "18:00:00",
        dias_semana: opcoes.horario === false ? null : [1, 2, 3, 4, 5],
      },
    ],
    processo_partes: Array.from({ length: opcoes.processos ?? 1 }, (_, i) => ({
      escritorio_id: "esc-1",
      cliente_id: "cli-1",
      eh_cliente: true,
      processos: { id: `${processoId}-${i}`, segredo_justica: opcoes.sigiloso ?? false, responsavel_id: null },
    })),
    movimentacoes: [{ processo_id: `${processoId}-0`, data: "2026-10-20T10:00:00Z" }],
    conversas: [{ id: "conv-1", escritorio_id: "esc-1", canal: "whatsapp", cliente_id: "cli-1", telefone_e164: TELEFONE, ultima_mensagem_recebida_em: AGORA.toISOString() }],
    mensagens: [] as Linha[],
  } as Record<string, Linha[]>;
}

const deps = (whatsapp: ClienteWhatsapp | null, ia: ClienteIa | null) => ({ whatsappDe: async () => whatsapp, ia, agora: AGORA });

describe("identificarCliente", () => {
  it("número de dois clientes diferentes é ambíguo; um só é verificado", async () => {
    const banco = {
      clientes_contatos: [
        { escritorio_id: "e1", cliente_id: "c1", telefone_e164: TELEFONE, ativo: true, verificado_em: "x" },
        { escritorio_id: "e2", cliente_id: "c9", telefone_e164: TELEFONE, ativo: true, verificado_em: "x" },
      ],
    };
    expect((await identificarCliente(criarAdminFalso(banco).admin, TELEFONE)).tipo).toBe("ambiguo");
    banco.clientes_contatos.pop();
    expect(await identificarCliente(criarAdminFalso(banco).admin, TELEFONE)).toEqual({ tipo: "verificado", escritorioId: "e1", clienteId: "c1" });
    expect((await identificarCliente(criarAdminFalso({ clientes_contatos: [] }).admin, TELEFONE)).tipo).toBe("nenhum");
  });
});

describe("enviarMensagensCliente (job)", () => {
  const filaUma = () => ({ fila_ler: () => [{ id: 1, payload: { mensagem_id: "m1" }, tentativas: 1, max_tentativas: 5 }] });
  const mensagemEnfileirada = (banco: Record<string, Linha[]>) => {
    banco.mensagens.push({ id: "m1", escritorio_id: "esc-1", conversa_id: "conv-1", texto: "Texto aprovado", status_entrega: "enfileirada" });
  };

  it("com envio desligado, nada sai e a mensagem registra o motivo", async () => {
    const banco = bancoBase({ envioAtivo: false });
    mensagemEnfileirada(banco);
    const { admin, escritas } = criarAdminFalso(banco, filaUma());
    const w = whatsappFalso();
    const r = await enviarMensagensCliente(admin, { whatsapp: w, agora: AGORA });
    expect(r.enviadas).toBe(0);
    expect(w.enviarTexto).not.toHaveBeenCalled();
    expect(w.enviarTemplate).not.toHaveBeenCalled();
    expect(banco.mensagens[0]).toMatchObject({ status_entrega: "falhou", erro: "envio ao cliente desligado nas configurações" });
    expect(escritas.rpcs.map((x) => x.nome)).toContain("fila_concluir");
  });

  it("opt-out do cliente impede o envio mesmo com o envio geral ligado", async () => {
    const banco = bancoBase({ envioAtivo: true, optOut: true });
    mensagemEnfileirada(banco);
    const { admin } = criarAdminFalso(banco, filaUma());
    const w = whatsappFalso();
    await enviarMensagensCliente(admin, { whatsapp: w, agora: AGORA });
    expect(w.enviarTexto).not.toHaveBeenCalled();
    expect(banco.mensagens[0].status_entrega).toBe("falhou");
  });

  it("com tudo liberado e dentro da janela de 24 h, manda texto aprovado", async () => {
    const banco = bancoBase({ envioAtivo: true });
    mensagemEnfileirada(banco);
    const { admin } = criarAdminFalso(banco, filaUma());
    const w = whatsappFalso();
    const r = await enviarMensagensCliente(admin, { whatsapp: w, agora: AGORA });
    expect(r.enviadas).toBe(1);
    expect(w.enviarTexto).toHaveBeenCalledWith(TELEFONE, "Texto aprovado");
    expect(banco.mensagens[0]).toMatchObject({ status_entrega: "enviada", id_externo: "w-texto" });
  });

  it("fora da janela de 24 h usa o template aprovado, não texto livre", async () => {
    const banco = bancoBase({ envioAtivo: true });
    banco.conversas[0].ultima_mensagem_recebida_em = "2026-10-20T10:00:00Z";
    mensagemEnfileirada(banco);
    const { admin } = criarAdminFalso(banco, filaUma());
    const w = whatsappFalso();
    await enviarMensagensCliente(admin, { whatsapp: w, agora: AGORA });
    expect(w.enviarTexto).not.toHaveBeenCalled();
    expect(w.enviarTemplate).toHaveBeenCalledTimes(1);
  });
});

describe("atenderCliente", () => {
  const entrada = (texto: string) => mensagemDoCliente(texto);

  it("fora do horário responde só com o aviso, sem chamar a IA", async () => {
    const banco = bancoBase({ envioAtivo: true });
    banco.escritorios[0].timezone = "America/Cuiaba";
    const sabado = new Date(Date.UTC(2026, 9, 31, 16, 0));
    const { admin, escritas } = criarAdminFalso(banco, { fila_enfileirar: () => 1 });
    const ia = iaFalsa("outro");
    await atenderCliente(admin, entrada("Oi"), { tipo: "verificado", escritorioId: "esc-1", clienteId: "cli-1" }, { whatsappDe: async () => whatsappFalso(), ia: ia.cliente, agora: sabado });
    expect(ia.gerarEstruturado).not.toHaveBeenCalled();
    const saida = escritas.inserts.find((i) => i.tabela === "mensagens" && i.linha.direcao === "saida");
    expect(saida?.linha.intent).toBe("fora_do_horario");
    expect(String(saida?.linha.texto)).toContain("Sou a assistente virtual (IA)");
  });

  it("andamento de processo sigiloso nunca traz detalhe", async () => {
    const banco = bancoBase({ envioAtivo: true, sigiloso: true });
    const { admin, escritas } = criarAdminFalso(banco, { fila_enfileirar: () => 1 });
    const ia = iaFalsa("andamento_processo");
    await atenderCliente(admin, entrada("Tem novidade no meu caso?"), { tipo: "verificado", escritorioId: "esc-1", clienteId: "cli-1" }, deps(whatsappFalso(), ia.cliente));
    const saida = escritas.inserts.find((i) => i.tabela === "mensagens" && i.linha.intent === "andamento_processo");
    expect(String(saida?.linha.texto)).toContain("segredo de justiça");
    expect(String(saida?.linha.texto)).not.toMatch(/\d{7}-\d{2}/);
    expect(String(saida?.linha.texto)).not.toContain("/10/2026");
  });

  it("resposta livre da IA vira rascunho para aprovação e não é enviada nem inserida como saída", async () => {
    const banco = bancoBase({ envioAtivo: true });
    const { admin, escritas } = criarAdminFalso(banco, { fila_enfileirar: () => 1, criar_rascunho_cliente: () => "msg-rascunho" });
    const ia = iaFalsa("outro", { texto: "Vou pedir que a equipe responda.", depende_de_advogado: false });
    const w = whatsappFalso();
    await atenderCliente(admin, entrada("Quanto custa uma consulta?"), { tipo: "verificado", escritorioId: "esc-1", clienteId: "cli-1" }, deps(w, ia.cliente));
    expect(escritas.rpcs.map((x) => x.nome)).toContain("criar_rascunho_cliente");
    expect(w.enviarTexto).not.toHaveBeenCalled();
    const textoDoRascunho = String(escritas.rpcs.find((x) => x.nome === "criar_rascunho_cliente")?.args.p_texto);
    expect(textoDoRascunho).toContain("Vou pedir que a equipe responda.");
    // O rascunho não entra na fila: só a confirmação de recebimento (fixa) entra.
    const filas = escritas.rpcs.filter((x) => x.nome === "fila_enfileirar");
    expect(filas).toHaveLength(1);
    expect(escritas.inserts.some((i) => i.linha.texto === textoDoRascunho)).toBe(false);
  });

  it("falar com advogado cria tarefa e não responde com texto livre", async () => {
    const banco = bancoBase({ envioAtivo: true });
    banco.tarefas = [];
    const { admin, escritas } = criarAdminFalso(banco, { fila_enfileirar: () => 1 });
    const ia = iaFalsa("falar_com_advogado");
    await atenderCliente(admin, entrada("Quero falar com a doutora"), { tipo: "verificado", escritorioId: "esc-1", clienteId: "cli-1" }, deps(whatsappFalso(), ia.cliente));
    expect(escritas.inserts.some((i) => i.tabela === "tarefas" && i.linha.tipo === "contato_cliente")).toBe(true);
    expect(escritas.rpcs.map((x) => x.nome)).not.toContain("criar_rascunho_cliente");
  });

  it("pedido de descadastro registra o opt-out e não responde", async () => {
    const banco = bancoBase({ envioAtivo: true });
    const { admin, escritas } = criarAdminFalso(banco, { fila_enfileirar: () => 1 });
    const ia = iaFalsa("outro");
    const r = await atenderCliente(admin, entrada("Sair"), { tipo: "verificado", escritorioId: "esc-1", clienteId: "cli-1" }, deps(whatsappFalso(), ia.cliente));
    expect(r).toBeNull();
    expect(escritas.updates.some((u) => u.tabela === "clientes_contatos" && u.patch.opt_out_em)).toBe(true);
    expect(escritas.rpcs.map((x) => x.nome)).not.toContain("fila_enfileirar");
  });

  it("número não verificado não recebe texto de atendimento, só o pedido de confirmação", async () => {
    const banco = bancoBase({ envioAtivo: true });
    banco.clientes_contatos[0].verificado_em = null;
    const { admin, escritas } = criarAdminFalso(banco, { verificar_contato_cliente: () => [] });
    const ia = iaFalsa("outro");
    await atenderCliente(admin, entrada("Quanto custa?"), { tipo: "nao_verificado", escritorioId: "esc-1", clienteId: "cli-1" }, deps(whatsappFalso(), ia.cliente));
    expect(ia.gerarEstruturado).not.toHaveBeenCalled();
    const saida = escritas.inserts.find((i) => i.tabela === "mensagens" && i.linha.intent === "nao_verificado");
    expect(saida?.linha.status_entrega).toBe("falhou");
  });
});
