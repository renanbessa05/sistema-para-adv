import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Papel, Sessao } from "./sessao";

export const STATUS_TAREFA: Record<string, string> = { a_fazer: "A fazer", em_andamento: "Em andamento", pronta_para_revisao: "Pronta para revisão", concluida: "Concluída", cancelada: "Cancelada" };
export const COLUNAS_QUADRO = ["a_fazer", "em_andamento", "pronta_para_revisao", "concluida"] as const;
export const TIPOS_TAREFA: Record<string, string> = { protocolar: "Protocolar", redigir: "Redigir", revisar: "Revisar", audiencia: "Audiência", contato_cliente: "Contato com cliente", diligencia: "Diligência", conferencia_pje: "Conferência no PJe", outro: "Outro" };
export const PRIORIDADES: Record<string, string> = { baixa: "Baixa", normal: "Normal", alta: "Alta", critica: "Crítica" };
export const EVENTOS_TAREFA: Record<string, string> = { criada: "Criada", reatribuida: "Reatribuída", status_alterado: "Status alterado", comentario: "Comentário", vencimento_alterado: "Vencimento alterado" };

export interface TarefaQuadro {
  id: string;
  titulo: string;
  tipo: string;
  status: string;
  prioridade: string;
  vencimento: string | null;
  executor_id: string | null;
  responsavel_id: string | null;
  processo_id: string | null;
  prazo_id: string | null;
  concluida_em: string | null;
  processos: { numero_cnj_mascara: string | null } | null;
  prazos: { data_final: string; status: string } | null;
  atrasada: boolean;
  critica: boolean;
}

const PRAZO_ABERTO = new Set(["confirmado", "prorrogado", "vencido", "suspenso"]);

/** "Atrasada": vencimento < hoje e não concluída/cancelada. "Crítica": prazo ligado em aberto com data final <= hoje. */
export function classificarTarefa<T extends { status: string; vencimento: string | null; prazos: { data_final: string; status: string } | null }>(t: T, hoje: string): T & { atrasada: boolean; critica: boolean } {
  const aberta = t.status !== "concluida" && t.status !== "cancelada";
  const atrasada = aberta && Boolean(t.vencimento) && (t.vencimento as string) < hoje;
  const critica = aberta && Boolean(t.prazos) && PRAZO_ABERTO.has(t.prazos!.status) && t.prazos!.data_final <= hoje;
  return { ...t, atrasada, critica };
}

/**
 * Tarefas do quadro: abertas de qualquer data e concluídas dos últimos 7 dias.
 * `executorId` nulo = todos (só faz sentido para sócio; a RLS garante o escritório).
 */
export async function listarTarefasQuadro(supabase: SupabaseClient, filtros: { executorId: string | null; processoId: string | null; hoje: string }): Promise<TarefaQuadro[]> {
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let consulta = supabase
    .from("tarefas")
    .select("id, titulo, tipo, status, prioridade, vencimento, executor_id, responsavel_id, processo_id, prazo_id, concluida_em, processos(numero_cnj_mascara), prazos(data_final, status)")
    .or(`status.in.(a_fazer,em_andamento,pronta_para_revisao),and(status.eq.concluida,concluida_em.gte.${seteDiasAtras})`)
    .order("vencimento", { ascending: true, nullsFirst: false })
    .limit(400);
  if (filtros.executorId) consulta = consulta.eq("executor_id", filtros.executorId);
  if (filtros.processoId) consulta = consulta.eq("processo_id", filtros.processoId);
  const { data, error } = await consulta;
  if (error) throw new Error(`Falha ao listar tarefas: ${error.message}`);
  return ((data ?? []) as unknown as Omit<TarefaQuadro, "atrasada" | "critica">[]).map((t) => classificarTarefa(t, filtros.hoje));
}

/** Tarefa "administrativa" (mesma regra de app.tarefa_eh_administrativa): sem prazo ligado e de tipo não jurídico. */
export function ehAdministrativa(t: { prazo_id: string | null; tipo: string }): boolean {
  return !t.prazo_id && ["contato_cliente", "diligencia", "conferencia_pje", "outro"].includes(t.tipo);
}

export interface PermissoesTarefa {
  mover: boolean;
  concluir: boolean;
  cancelar: boolean;
  reatribuir: boolean;
  editar: boolean;
}

/** Espelha as regras das RPCs (a segurança real está no banco): serve só para esconder ações que vão falhar. */
export function permissoesTarefa(sessao: Sessao, t: { status: string; executor_id: string | null; responsavel_id: string | null; prazo_id: string | null; tipo: string; criado_por_id?: string | null }): PermissoesTarefa {
  const papel: Papel = sessao.papel;
  const eu = sessao.usuarioId;
  const terminal = t.status === "concluida" || t.status === "cancelada";
  const socio = papel === "socio";
  const envolvido = t.executor_id === eu || t.responsavel_id === eu;
  const administrativa = ehAdministrativa(t);
  return {
    mover: !terminal && (socio || envolvido) && (t.status === "a_fazer" || t.status === "em_andamento"),
    concluir: !terminal && (socio || papel === "advogado" || (papel === "administrativo" && administrativa)),
    cancelar: !terminal && (socio || papel === "advogado" || (papel === "administrativo" && administrativa)),
    reatribuir: !terminal && (socio || (papel === "advogado" && envolvido) || (papel === "administrativo" && (t.executor_id === eu || administrativa))),
    editar: !terminal && (socio || envolvido || t.criado_por_id === eu),
  };
}
