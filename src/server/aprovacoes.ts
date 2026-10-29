import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Fila de aprovações humanas (tudo que a IA ou o WhatsApp propõe passa por aqui). Leitura com o cliente do usuário (RLS). */

export const ROTULO_OBJETO_APROVACAO: Record<string, string> = {
  prazo: "Prazo",
  tarefa_reatribuicao: "Reatribuição de tarefa",
  tarefa_conclusao: "Conclusão de tarefa",
  contrato: "Contrato de honorários",
  minuta: "Minuta",
  mensagem_cliente: "Mensagem ao cliente",
  calculo: "Cálculo",
};

export const ROTULO_STATUS_APROVACAO: Record<string, string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  ajustada: "Ajustada",
  expirada: "Expirada",
};

export const TOM_STATUS_APROVACAO: Record<string, "neutro" | "info" | "sucesso" | "alerta" | "perigo" | "contorno"> = {
  pendente: "alerta",
  aprovada: "sucesso",
  rejeitada: "neutro",
  ajustada: "info",
  expirada: "contorno",
};

export interface Aprovacao {
  id: string;
  objeto_tipo: string;
  objeto_id: string;
  solicitada_por_tipo: "ia" | "usuario";
  solicitada_por_id: string | null;
  conteudo_snapshot: unknown;
  status: string;
  aprovador_id: string | null;
  decidida_em: string | null;
  comentario: string | null;
  ajustes: unknown;
  prazo_resposta_em: string | null;
  criado_em: string;
}

const COLUNAS = "id, objeto_tipo, objeto_id, solicitada_por_tipo, solicitada_por_id, conteudo_snapshot, status, aprovador_id, decidida_em, comentario, ajustes, prazo_resposta_em, criado_em";

export async function listarAprovacoesPendentes(supabase: SupabaseClient): Promise<Aprovacao[]> {
  const { data, error } = await supabase.from("aprovacoes").select(COLUNAS).eq("status", "pendente").order("prazo_resposta_em", { ascending: true, nullsFirst: false }).order("criado_em", { ascending: true }).limit(200);
  if (error) throw new Error(`Falha ao listar aprovações: ${error.message}`);
  return (data ?? []) as unknown as Aprovacao[];
}

export async function listarAprovacoesDecididas(supabase: SupabaseClient, limite = 50): Promise<Aprovacao[]> {
  const { data, error } = await supabase.from("aprovacoes").select(COLUNAS).neq("status", "pendente").order("decidida_em", { ascending: false, nullsFirst: false }).limit(limite);
  if (error) throw new Error(`Falha ao listar aprovações decididas: ${error.message}`);
  return (data ?? []) as unknown as Aprovacao[];
}

/** true quando o prazo de resposta já passou (comparação feita aqui para manter o componente puro). */
export function respostaAtrasada(a: Pick<Aprovacao, "prazo_resposta_em">, agora: Date = new Date()): boolean {
  return a.prazo_resposta_em ? new Date(a.prazo_resposta_em).getTime() < agora.getTime() : false;
}

/** Link para o objeto aprovado, quando há tela para ele. */
export function linkDoObjeto(objetoTipo: string, objetoId: string): string | null {
  if (objetoTipo === "prazo") return `/prazos/${objetoId}`;
  if (objetoTipo === "tarefa_reatribuicao" || objetoTipo === "tarefa_conclusao") return `/tarefas/${objetoId}`;
  if (objetoTipo === "contrato") return `/contratos/${objetoId}`;
  return null;
}

const ROTULO_CHAVE: Record<string, string> = {
  titulo: "título",
  ato_descricao: "ato",
  ato: "ato",
  data_final: "data final",
  data_interna: "data interna",
  de: "de",
  para: "para",
  motivo: "motivo",
  mensagem: "mensagem",
  descricao: "descrição",
  numero_cnj: "processo",
  processo: "processo",
  cliente: "cliente",
  valor: "valor",
  resumo: "resumo",
};

/** Resume o snapshot em até `max` pares chave/valor legíveis (campos escalares primeiro; objetos virão como JSON curto). */
export function resumirSnapshot(snapshot: unknown, max = 6): { chave: string; valor: string }[] {
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) return snapshot ? [{ chave: "conteúdo", valor: String(snapshot).slice(0, 160) }] : [];
  const entradas = Object.entries(snapshot as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== "");
  const escalares = entradas.filter(([, v]) => typeof v !== "object");
  const compostos = entradas.filter(([, v]) => typeof v === "object");
  return [...escalares, ...compostos].slice(0, max).map(([k, v]) => {
    let valor: string;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) valor = `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
    else if (typeof v === "object") valor = JSON.stringify(v);
    else valor = String(v);
    return { chave: ROTULO_CHAVE[k] ?? k.replace(/_/g, " "), valor: valor.length > 160 ? `${valor.slice(0, 159)}…` : valor };
  });
}
