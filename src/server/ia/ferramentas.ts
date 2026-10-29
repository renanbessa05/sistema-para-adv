import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { delimitarDado, type FerramentaIa } from "@/lib/ia";
import { calcularPrazo, formatarBr, memoriaComoTexto, type Contagem, type OrigemIntimacao } from "@/lib/prazos";
import { carregarCalendario } from "../calendario";
import { lerPaginas, listarDocumentos } from "../documentos";
import type { Sessao } from "../sessao";

/**
 * Ferramentas de LEITURA expostas à assistente. Todas usam o cliente do usuário (RLS decide o que ele vê),
 * devolvem texto delimitado por delimitarDado e nunca escrevem no banco. Saídas curtas: o modelo pede mais
 * se precisar (páginas seguintes, outro período).
 */

const LIMITE_LISTA = 20;

/** Tipa a ferramenta pelo schema e a devolve na forma genérica que a lista aceita. */
function ferramenta<T extends z.ZodType>(f: FerramentaIa<T>): FerramentaIa {
  return f as unknown as FerramentaIa;
}

function linhaProcesso(p: { id: string; numero_cnj_mascara: string | null; status: string; segredo_justica: boolean; competencia?: string | null; orgao_julgador_nome?: string | null; classe_nome?: string | null }): string {
  return `- ${p.numero_cnj_mascara ?? "sem número"} (id ${p.id}) · ${p.status}${p.segredo_justica ? " · SIGILOSO" : ""}${p.classe_nome ? ` · ${p.classe_nome}` : ""}${p.orgao_julgador_nome ? ` · ${p.orgao_julgador_nome}` : ""}`;
}

export function criarFerramentas(supabase: SupabaseClient, sessao: Sessao, opcoes: { timezone: string }): FerramentaIa[] {
  const ferramentas: FerramentaIa[] = [];

  ferramentas.push(ferramenta({
    nome: "consultar_processo",
    descricao: "Localiza processos da carteira por número CNJ (completo ou parcial, só dígitos também serve) ou por nome de parte/cliente, ou traz os dados de um processo pelo id. Devolve partes, responsável, fase, últimas movimentações e prazos abertos.",
    schema: z.object({
      numero_ou_nome: z.string().nullable().describe("Número CNJ (ou parte dele) ou nome de cliente/parte; null se usar o id"),
      processo_id: z.string().nullable().describe("UUID do processo, quando conhecido"),
    }),
    executar: async ({ numero_ou_nome, processo_id }) => {
      let ids: string[] = [];
      if (processo_id) ids = [processo_id];
      else if (numero_ou_nome) {
        const digitos = numero_ou_nome.replace(/\D/g, "");
        if (digitos.length >= 5) {
          const { data } = await supabase.from("processos").select("id").like("numero_cnj", `${digitos.length >= 20 ? digitos : digitos.slice(0, 7)}%`).limit(6);
          ids = (data ?? []).map((p) => p.id as string);
        } else {
          const { data } = await supabase.from("processo_partes").select("processo_id").ilike("nome", `%${numero_ou_nome.replace(/[%,]/g, "")}%`).limit(10);
          ids = [...new Set((data ?? []).map((p) => p.processo_id as string))];
        }
      }
      if (ids.length === 0) return delimitarDado("processos", "Nenhum processo encontrado com esse número ou nome.");
      const { data: procs } = await supabase.from("processos").select("id, numero_cnj_mascara, status, segredo_justica, competencia, orgao_julgador_nome, classe_nome, responsavel_id, fase_id, valor_causa, data_ajuizamento").in("id", ids).limit(6);
      if (!procs?.length) return delimitarDado("processos", "Nenhum processo encontrado (ou sem permissão de acesso).");
      if (procs.length > 1) return delimitarDado("processos", `Mais de um processo bate; peça o número completo ou use o id:\n${procs.map((p) => linhaProcesso(p as Parameters<typeof linhaProcesso>[0])).join("\n")}`);
      const p = procs[0];
      const [{ data: partes }, { data: movs }, { data: prazos }, { data: membros }] = await Promise.all([
        supabase.from("processo_partes").select("nome, polo, eh_cliente").eq("processo_id", p.id).order("polo"),
        supabase.from("movimentacoes").select("data, nome, complemento").eq("processo_id", p.id).order("data", { ascending: false }).limit(8),
        supabase.from("prazos").select("id, ato_descricao, data_final, data_interna, status").eq("processo_id", p.id).in("status", ["sugerido", "confirmado", "prorrogado", "suspenso", "vencido"]).order("data_final").limit(10),
        supabase.from("escritorio_membros").select("usuario_id, nome_completo").eq("escritorio_id", sessao.escritorioId),
      ]);
      const nomes = new Map((membros ?? []).map((m) => [m.usuario_id as string, m.nome_completo as string]));
      const linhas = [
        linhaProcesso(p as Parameters<typeof linhaProcesso>[0]),
        `Responsável: ${p.responsavel_id ? (nomes.get(p.responsavel_id as string) ?? "membro") : "sem responsável"} · Valor da causa: ${p.valor_causa ?? "—"} · Ajuizamento: ${p.data_ajuizamento ? formatarBr(String(p.data_ajuizamento)) : "—"}`,
        `Partes: ${(partes ?? []).map((x) => `${x.nome} (${x.polo}${x.eh_cliente ? ", cliente" : ""})`).join("; ") || "nenhuma"}`,
        `Prazos abertos:${(prazos ?? []).length ? "\n" + (prazos ?? []).map((z) => `  - ${formatarBr(String(z.data_final))} ${z.ato_descricao ?? "prazo"} [${z.status}] (id ${z.id})${z.data_interna ? ` interna ${formatarBr(String(z.data_interna))}` : ""}`).join("\n") : " nenhum"}`,
        `Últimas movimentações:${(movs ?? []).length ? "\n" + (movs ?? []).map((m) => `  - ${formatarBr(String(m.data).slice(0, 10))} ${m.nome}${m.complemento ? ` (${m.complemento})` : ""}`).join("\n") : " nenhuma registrada"}`,
      ];
      return delimitarDado("processo", linhas.join("\n"));
    },
  }));

  ferramentas.push(ferramenta({
    nome: "listar_publicacoes",
    descricao: "Lista publicações do DJEN (intimações, despachos, sentenças) captadas pelo escritório: por processo, por status ou as mais recentes. Devolve data, tipo, status e resumo (sem o texto completo; use ler_publicacao).",
    schema: z.object({
      processo_id: z.string().nullable().describe("UUID do processo, ou null para todas"),
      status: z.enum(["a_tratar", "todas"]).describe("a_tratar = ainda não tratadas pela equipe"),
      limite: z.number().int().min(1).max(LIMITE_LISTA).describe("Quantas, no máximo"),
    }),
    executar: async ({ processo_id, status, limite }) => {
      let q = supabase.from("publicacoes").select("id, data_disponibilizacao, tipo, status, resumo_ia, numero_cnj, processo_id").order("data_disponibilizacao", { ascending: false }).limit(limite);
      if (processo_id) q = q.eq("processo_id", processo_id);
      if (status === "a_tratar") q = q.in("status", ["nova", "classificada", "vinculada", "sem_processo", "com_prazo_sugerido"]);
      const { data } = await q;
      if (!data?.length) return delimitarDado("publicacoes", "Nenhuma publicação encontrada.");
      return delimitarDado("publicacoes", data.map((p) => `- ${formatarBr(String(p.data_disponibilizacao))} ${p.tipo ?? "sem tipo"} [${p.status}] (id ${p.id})${p.numero_cnj ? ` · ${p.numero_cnj}` : ""}: ${p.resumo_ia ?? "(sem resumo; use ler_publicacao)"}`).join("\n"));
    },
  }));

  ferramentas.push(ferramenta({
    nome: "ler_publicacao",
    descricao: "Lê o texto completo de uma publicação pelo id. O acesso é auditado e respeita o sigilo do processo.",
    schema: z.object({ publicacao_id: z.string().describe("UUID da publicação") }),
    executar: async ({ publicacao_id }) => {
      const { data, error } = await supabase.rpc("publicacao_texto", { p_publicacao_id: publicacao_id });
      if (error) return delimitarDado("publicacao", `Sem acesso ao texto: ${error.message}`);
      return delimitarDado("publicacao", String(data ?? "").slice(0, 20_000));
    },
  }));

  ferramentas.push(ferramenta({
    nome: "listar_prazos",
    descricao: "Lista prazos por período (hoje, amanhã, semana, próximos 30 dias ou intervalo de datas) ou de um processo. Quem não é sócio vê só os próprios prazos.",
    schema: z.object({
      periodo: z.enum(["hoje", "semana", "trinta_dias", "intervalo", "todos_abertos"]),
      de: z.string().nullable().describe("YYYY-MM-DD, para intervalo"),
      ate: z.string().nullable().describe("YYYY-MM-DD, para intervalo"),
      processo_id: z.string().nullable(),
      status: z.enum(["abertos", "sugeridos", "todos"]),
    }),
    executar: async ({ periodo, de, ate, processo_id, status }) => {
      const calendario = await carregarCalendario(supabase, { tribunalId: null, comarcaId: null });
      const { calcularPeriodos } = await import("@/lib/prazos");
      const p = calcularPeriodos(calendario, { timeZone: opcoes.timezone });
      let inicio = p.hoje;
      let fim: string | null = null;
      if (periodo === "hoje") fim = p.amanha;
      else if (periodo === "semana") fim = p.semanaFim;
      else if (periodo === "trinta_dias") fim = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      else if (periodo === "intervalo") {
        inicio = de ?? p.hoje;
        fim = ate ?? p.semanaFim;
      }
      let q = supabase.from("prazos").select("id, ato_descricao, data_final, data_interna, status, responsavel_id, processos(numero_cnj_mascara, segredo_justica)").order("data_final").limit(40);
      if (status === "abertos") q = q.in("status", ["confirmado", "prorrogado", "vencido"]);
      else if (status === "sugeridos") q = q.eq("status", "sugerido");
      else q = q.in("status", ["sugerido", "confirmado", "prorrogado", "suspenso", "vencido"]);
      if (fim) q = q.gte("data_final", inicio).lte("data_final", fim);
      if (processo_id) q = q.eq("processo_id", processo_id);
      if (sessao.papel !== "socio") q = q.eq("responsavel_id", sessao.usuarioId);
      const { data } = await q;
      if (!data?.length) return delimitarDado("prazos", "Nenhum prazo nesse recorte.");
      return delimitarDado(
        "prazos",
        data.map((z) => {
          const proc = z.processos as unknown as { numero_cnj_mascara: string | null } | null;
          return `- ${formatarBr(String(z.data_final))} ${z.ato_descricao ?? "prazo"} [${z.status}] · ${proc?.numero_cnj_mascara ?? "sem processo"} (prazo id ${z.id})${z.data_interna ? ` · interna ${formatarBr(String(z.data_interna))}` : ""}`;
        }).join("\n"),
      );
    },
  }));

  ferramentas.push(ferramenta({
    nome: "calcular_prazo",
    descricao: "Conta um prazo processual pelo motor do sistema (calendário forense do TJ-MT, dias úteis, recesso, dobro). Devolve data final, data interna e a memória de contagem. Use para responder 'quando vence' ou 'quantos dias'.",
    schema: z.object({
      data_disponibilizacao: z.string().nullable().describe("YYYY-MM-DD da disponibilização no DJEN (origem publicacao_djen)"),
      data_inicio_contagem: z.string().nullable().describe("YYYY-MM-DD do dia 1, quando a ciência foi pessoal/audiência (sobrepõe a disponibilização)"),
      quantidade: z.number().int().min(1).max(3650),
      contagem: z.enum(["dias_uteis", "dias_corridos", "horas"]),
      dobro: z.boolean().describe("Prazo em dobro (Fazenda, MP, Defensoria)"),
      descricao: z.string().describe("Nome do ato, ex.: 'Contestação'"),
      comarca_id: z.string().nullable().describe("UUID da comarca do processo, se souber (feriados municipais)"),
    }),
    executar: async (e) => {
      if (!e.data_disponibilizacao && !e.data_inicio_contagem) return delimitarDado("prazo_calculado", "Informe a data de disponibilização no DJEN ou a data do dia 1 da contagem.");
      const calendario = await carregarCalendario(supabase, { tribunalId: null, comarcaId: e.comarca_id });
      const origem: OrigemIntimacao = e.data_inicio_contagem ? "manual" : "publicacao_djen";
      const r = calcularPrazo({
        origem,
        dataDisponibilizacao: e.data_disponibilizacao ?? undefined,
        dataInicioContagem: e.data_inicio_contagem ?? undefined,
        ato: { descricao: e.descricao, quantidade: e.quantidade, contagem: e.contagem as Contagem, multiplicador: e.dobro ? 2 : 1 },
        calendario,
      });
      return delimitarDado("prazo_calculado", [`Data final: ${formatarBr(r.dataFinal)} · data interna: ${formatarBr(r.dataInterna)} · ${r.quantidadeEfetiva} ${r.contagem}`, r.calendarioIncompleto ? "AVISO: calendário incompleto para o período; a data precisa de conferência manual." : "", ...r.avisos.map((a) => `Aviso: ${a}`), "Memória:", memoriaComoTexto(r)].filter(Boolean).join("\n"));
    },
  }));

  ferramentas.push(ferramenta({
    nome: "listar_tarefas",
    descricao: "Lista tarefas abertas: as da pessoa que pergunta, de alguém da equipe (sócio), ou de um processo.",
    schema: z.object({
      de_quem: z.enum(["minhas", "pessoa", "processo", "todas"]),
      pessoa_nome: z.string().nullable(),
      processo_id: z.string().nullable(),
      incluir_concluidas: z.boolean(),
    }),
    executar: async ({ de_quem, pessoa_nome, processo_id, incluir_concluidas }) => {
      const { data: membros } = await supabase.from("escritorio_membros").select("usuario_id, nome_completo").eq("escritorio_id", sessao.escritorioId);
      const nomes = new Map((membros ?? []).map((m) => [m.usuario_id as string, m.nome_completo as string]));
      let q = supabase.from("tarefas").select("id, titulo, status, vencimento, executor_id, prioridade, processos(numero_cnj_mascara)").order("vencimento", { ascending: true, nullsFirst: false }).limit(LIMITE_LISTA);
      if (!incluir_concluidas) q = q.not("status", "in", "(concluida,cancelada)");
      if (de_quem === "minhas") q = q.eq("executor_id", sessao.usuarioId);
      if (de_quem === "pessoa") {
        const alvo = (membros ?? []).find((m) => pessoa_nome && String(m.nome_completo).toLowerCase().includes(pessoa_nome.toLowerCase()));
        if (!alvo) return delimitarDado("tarefas", "Não encontrei essa pessoa na equipe.");
        if (sessao.papel !== "socio" && alvo.usuario_id !== sessao.usuarioId) return delimitarDado("tarefas", "Só sócios veem tarefas de outras pessoas.");
        q = q.eq("executor_id", alvo.usuario_id as string);
      }
      if (de_quem === "processo" && processo_id) q = q.eq("processo_id", processo_id);
      if (de_quem === "todas" && sessao.papel !== "socio") q = q.eq("executor_id", sessao.usuarioId);
      const { data } = await q;
      if (!data?.length) return delimitarDado("tarefas", "Nenhuma tarefa nesse recorte.");
      return delimitarDado("tarefas", data.map((t) => `- ${t.vencimento ? formatarBr(String(t.vencimento)) : "sem data"} ${t.titulo} [${t.status}] · ${t.executor_id ? (nomes.get(t.executor_id as string) ?? "membro") : "sem executor"} · ${(t.processos as unknown as { numero_cnj_mascara: string | null } | null)?.numero_cnj_mascara ?? "sem processo"} (id ${t.id})`).join("\n"));
    },
  }));

  ferramentas.push(ferramenta({
    nome: "listar_documentos",
    descricao: "Lista documentos (autos, peças, anexos) de um processo ou de um cliente, com páginas e situação do texto extraído.",
    schema: z.object({ processo_id: z.string().nullable(), cliente_id: z.string().nullable() }),
    executar: async ({ processo_id, cliente_id }) => {
      const docs = await listarDocumentos(supabase, { processoId: processo_id ?? undefined, clienteId: cliente_id ?? undefined, limite: LIMITE_LISTA });
      if (!docs.length) return delimitarDado("documentos", "Nenhum documento.");
      return delimitarDado("documentos", docs.map((d) => `- ${d.nome} (${d.tipo}, id ${d.id})${d.paginas ? ` · ${d.paginas} págs.` : ""} · ${d.texto_extraido_em ? (d.extracao_erro === "sem_texto" ? "sem texto (escaneado)" : "texto disponível") : "texto ainda não extraído"} · ${formatarBr(d.criado_em.slice(0, 10))}`).join("\n"));
    },
  }));

  ferramentas.push(ferramenta({
    nome: "ler_documento",
    descricao: "Lê o texto extraído de um documento por intervalo de páginas (até 20 por vez). Comece pelas primeiras e peça as seguintes se precisar.",
    schema: z.object({ documento_id: z.string(), pagina_inicial: z.number().int().min(1), pagina_final: z.number().int().min(1) }),
    executar: async ({ documento_id, pagina_inicial, pagina_final }) => {
      const ate = Math.min(pagina_final, pagina_inicial + 19);
      const paginas = await lerPaginas(supabase, documento_id, pagina_inicial, ate);
      if (!paginas.length) return delimitarDado("documento", "Sem texto nessas páginas (documento ainda não extraído, escaneado, ou sem permissão).");
      const { montarTrecho } = await import("@/lib/documentos/pdf");
      return delimitarDado("documento", montarTrecho(paginas, pagina_inicial, ate));
    },
  }));

  ferramentas.push(ferramenta({
    nome: "listar_equipe",
    descricao: "Lista os membros do escritório com papel e OAB.",
    schema: z.object({}),
    executar: async () => {
      const { data } = await supabase.from("escritorio_membros").select("nome_completo, papel, oab_numero, oab_uf, ativo").eq("escritorio_id", sessao.escritorioId).order("nome_completo");
      return delimitarDado("equipe", (data ?? []).map((m) => `- ${m.nome_completo} · ${m.papel}${m.oab_numero ? ` · OAB ${m.oab_numero}/${m.oab_uf}` : ""}${m.ativo ? "" : " · inativo"}`).join("\n") || "Equipe vazia.");
    },
  }));

  return ferramentas;
}
