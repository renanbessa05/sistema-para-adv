"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

function texto(fd: FormData, nome: string): string {
  const v = fd.get(nome);
  return typeof v === "string" ? v.trim() : "";
}
function opcional(fd: FormData, nome: string): string | null {
  return texto(fd, nome) || null;
}
function falhar(destino: string, mensagem: string): never {
  redirect(`${destino}?erro=${encodeURIComponent(mensagem)}`);
}
function concluido(destino: string, mensagem: string): never {
  redirect(`${destino}?ok=${encodeURIComponent(mensagem)}`);
}
/** Mensagens do Postgres (RAISE EXCEPTION nas RPCs) já vêm em português; só tiramos ruído. */
function mensagemDeErro(erro: { message: string } | null, padrao: string): string {
  if (!erro) return padrao;
  return erro.message.replace(/^.*?:\s*/, (m) => (m.length > 40 ? "" : m)).trim() || padrao;
}

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").nullable();
const uuidOpcional = z.string().uuid().nullable();

const esquemaNova = z.object({
  titulo: z.string().min(2, "Informe o título"),
  tipo: z.enum(["protocolar", "redigir", "revisar", "audiencia", "contato_cliente", "diligencia", "conferencia_pje", "outro"]),
  processo_id: uuidOpcional,
  descricao: z.string().nullable(),
  executor_id: uuidOpcional,
  vencimento: data,
  prioridade: z.enum(["baixa", "normal", "alta", "critica"]),
});

export async function criarTarefa(fd: FormData) {
  await exigirSessao();
  const lido = esquemaNova.safeParse({
    titulo: texto(fd, "titulo"),
    tipo: texto(fd, "tipo") || "outro",
    processo_id: opcional(fd, "processo_id"),
    descricao: opcional(fd, "descricao"),
    executor_id: opcional(fd, "executor_id"),
    vencimento: opcional(fd, "vencimento"),
    prioridade: texto(fd, "prioridade") || "normal",
  });
  const voltar = `/tarefas/nova${texto(fd, "processo_id") ? `?processo=${texto(fd, "processo_id")}` : ""}`;
  if (!lido.success) falhar(voltar, lido.error.issues[0]?.message ?? "Dados inválidos");
  const supabase = await criarClienteServidor();
  // criar_tarefa valida executor (membro ativo; estagiário só para si) e define o responsável pelo processo
  const { data: novoId, error } = await supabase.rpc("criar_tarefa", {
    p_titulo: lido.data.titulo,
    p_tipo: lido.data.tipo,
    p_processo_id: lido.data.processo_id,
    p_descricao: lido.data.descricao,
    p_executor_id: lido.data.executor_id,
    p_vencimento: lido.data.vencimento,
    p_prioridade: lido.data.prioridade,
    p_origem: "manual",
  });
  if (error || !novoId) falhar(voltar, mensagemDeErro(error, "Não foi possível criar a tarefa."));
  revalidatePath("/tarefas");
  if (lido.data.processo_id) revalidatePath(`/processos/${lido.data.processo_id}`);
  concluido(`/tarefas/${novoId as string}`, "Tarefa criada.");
}

export async function editarTarefa(tarefaId: string, fd: FormData) {
  await exigirSessao();
  const destino = `/tarefas/${tarefaId}`;
  const lido = z
    .object({ titulo: z.string().min(2, "Informe o título"), descricao: z.string().nullable(), prioridade: z.enum(["baixa", "normal", "alta", "critica"]), vencimento: data })
    .safeParse({ titulo: texto(fd, "titulo"), descricao: opcional(fd, "descricao"), prioridade: texto(fd, "prioridade") || "normal", vencimento: opcional(fd, "vencimento") });
  if (!lido.success) falhar(destino, lido.error.issues[0]?.message ?? "Dados inválidos");
  const supabase = await criarClienteServidor();
  // UPDATE direto só alcança campos descritivos (grant por coluna); status e executor passam pelas RPCs
  const { error } = await supabase.from("tarefas").update(lido.data).eq("id", tarefaId);
  if (error) falhar(destino, mensagemDeErro(error, "Não foi possível salvar."));
  revalidatePath(destino);
  revalidatePath("/tarefas");
  concluido(destino, "Tarefa atualizada.");
}

export async function reatribuirTarefa(tarefaId: string, fd: FormData) {
  await exigirSessao();
  const destino = `/tarefas/${tarefaId}`;
  const para = z.string().uuid().safeParse(texto(fd, "para_usuario"));
  if (!para.success) falhar(destino, "Escolha o novo executor.");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("reatribuir_tarefa", { p_id: tarefaId, p_para_usuario: para.data, p_motivo: opcional(fd, "motivo") });
  if (error) falhar(destino, mensagemDeErro(error, "Não foi possível reatribuir."));
  revalidatePath(destino);
  revalidatePath("/tarefas");
  concluido(destino, "Tarefa reatribuída.");
}

export async function alterarStatusTarefa(tarefaId: string, fd: FormData) {
  await exigirSessao();
  const destino = `/tarefas/${tarefaId}`;
  const status = z.enum(["em_andamento", "pronta_para_revisao"]).safeParse(texto(fd, "status"));
  if (!status.success) falhar(destino, "Status inválido.");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("alterar_status_tarefa", { p_id: tarefaId, p_status: status.data });
  if (error) falhar(destino, mensagemDeErro(error, "Não foi possível mover a tarefa."));
  revalidatePath(destino);
  revalidatePath("/tarefas");
  concluido(destino, status.data === "em_andamento" ? "Tarefa em andamento." : "Tarefa enviada para revisão.");
}

export async function concluirTarefa(tarefaId: string, fd: FormData) {
  await exigirSessao();
  const destino = `/tarefas/${tarefaId}`;
  const protocolado = fd.get("protocolado") === "on";
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("concluir_tarefa", { p_id: tarefaId, p_protocolado: protocolado });
  if (error) falhar(destino, mensagemDeErro(error, "Não foi possível concluir."));
  revalidatePath(destino);
  revalidatePath("/tarefas");
  revalidatePath("/hoje");
  concluido(destino, protocolado ? "Tarefa concluída e prazo marcado como cumprido." : "Tarefa concluída.");
}

export async function cancelarTarefa(tarefaId: string, fd: FormData) {
  await exigirSessao();
  const destino = `/tarefas/${tarefaId}`;
  const motivo = texto(fd, "motivo");
  if (!motivo) falhar(destino, "Cancelar exige motivo.");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("cancelar_tarefa", { p_id: tarefaId, p_motivo: motivo });
  if (error) falhar(destino, mensagemDeErro(error, "Não foi possível cancelar."));
  revalidatePath(destino);
  revalidatePath("/tarefas");
  concluido(destino, "Tarefa cancelada.");
}
