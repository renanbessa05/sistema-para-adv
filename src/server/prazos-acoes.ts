"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { mensagemErroBanco } from "@/server/publicacoes";

/**
 * Server actions de prazo. Cada uma chama a RPC correspondente com o cliente do usuário:
 * a RPC confere escritório, papel (sócio, advogado responsável ou colaborador) e a transição permitida.
 * Erros do banco voltam para a página do prazo em `?erro=`.
 */

const Id = z.uuid();
const DataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use o seletor de data)");

function voltar(id: string, params: { erro?: string; ok?: string }): never {
  const q = new URLSearchParams();
  if (params.erro) q.set("erro", params.erro);
  if (params.ok) q.set("ok", params.ok);
  redirect(`/prazos/${id}?${q.toString()}`);
}

function texto(fd: FormData, campo: string): string {
  const v = fd.get(campo);
  return typeof v === "string" ? v.trim() : "";
}

function lerId(fd: FormData): string {
  const id = Id.safeParse(texto(fd, "id"));
  if (!id.success) redirect("/prazos?erro=Prazo%20inv%C3%A1lido");
  return id.data;
}

function revalidar(id: string) {
  revalidatePath("/prazos");
  revalidatePath(`/prazos/${id}`);
  revalidatePath("/hoje");
  revalidatePath("/publicacoes");
  revalidatePath("/tarefas");
}

async function chamar(id: string, rpc: string, args: Record<string, unknown>, ok: string): Promise<never> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc(rpc, args);
  if (error) voltar(id, { erro: mensagemErroBanco(error) });
  revalidar(id);
  voltar(id, { ok });
}

/** sugerido | suspenso | prorrogado → confirmado. Pode alterar ato, multiplicador e data final; cria a tarefa. */
export async function confirmarPrazo(fd: FormData) {
  const id = lerId(fd);
  const dataFinal = texto(fd, "data_final");
  const atoId = texto(fd, "ato_id");
  const multiplicador = texto(fd, "multiplicador");
  const reconhecer = fd.get("reconhecer_calendario") === "on";
  const observacao = texto(fd, "observacao");

  if (dataFinal && !DataISO.safeParse(dataFinal).success) voltar(id, { erro: "Data final inválida." });
  if (atoId && !Id.safeParse(atoId).success) voltar(id, { erro: "Ato inválido." });
  if (multiplicador && !["1", "2"].includes(multiplicador)) voltar(id, { erro: "Multiplicador precisa ser 1 ou 2." });

  await chamar(
    id,
    "confirmar_prazo",
    {
      p_id: id,
      p_data_final: dataFinal || null,
      p_ato_id: atoId || null,
      p_multiplicador: multiplicador ? Number(multiplicador) : null,
      p_reconhecer_calendario: reconhecer,
      p_observacao: observacao || null,
    },
    "Prazo confirmado. A tarefa foi criada para o responsável.",
  );
}

/** sugerido → rejeitado, com motivo. */
export async function rejeitarPrazo(fd: FormData) {
  const id = lerId(fd);
  const motivo = texto(fd, "motivo");
  if (!motivo) voltar(id, { erro: "Informe o motivo da rejeição." });
  await chamar(id, "rejeitar_prazo", { p_id: id, p_motivo: motivo }, "Prazo rejeitado.");
}

/** confirmado | suspenso | prorrogado → suspenso | prorrogado, com fundamento e (na prorrogação) nova data. */
export async function suspenderOuProrrogarPrazo(fd: FormData) {
  const id = lerId(fd);
  const novoStatus = texto(fd, "novo_status");
  const novaData = texto(fd, "nova_data");
  const fundamento = texto(fd, "fundamento");
  if (!["suspenso", "prorrogado"].includes(novoStatus)) voltar(id, { erro: "Escolha suspender ou prorrogar." });
  if (!fundamento) voltar(id, { erro: "Informe o fundamento (ato normativo ou decisão)." });
  if (novaData && !DataISO.safeParse(novaData).success) voltar(id, { erro: "Nova data inválida." });
  if (novoStatus === "prorrogado" && !novaData) voltar(id, { erro: "Prorrogar exige a nova data final." });
  await chamar(
    id,
    "suspender_ou_prorrogar_prazo",
    { p_id: id, p_novo_status: novoStatus, p_nova_data: novaData || null, p_fundamento: fundamento },
    novoStatus === "suspenso" ? "Prazo suspenso." : "Prazo prorrogado.",
  );
}

/** suspenso → confirmado (retomar), com fundamento e nova data final opcional (≥ atual). */
export async function retomarPrazo(fd: FormData) {
  const id = lerId(fd);
  const novaData = texto(fd, "nova_data");
  const fundamento = texto(fd, "fundamento");
  if (!fundamento) voltar(id, { erro: "Informe o fundamento da retomada (ato normativo ou decisão)." });
  if (novaData && !DataISO.safeParse(novaData).success) voltar(id, { erro: "Nova data inválida." });
  await chamar(id, "retomar_prazo", { p_id: id, p_nova_data: novaData || null, p_fundamento: fundamento }, "Prazo retomado: volta a contar como confirmado.");
}

const EVIDENCIAS = ["tarefa", "manual", "datajud", "pje"] as const;

/** confirmado | prorrogado | vencido → cumprido. */
export async function cumprirPrazo(fd: FormData) {
  const id = lerId(fd);
  const evidencia = texto(fd, "evidencia") || "manual";
  if (!(EVIDENCIAS as readonly string[]).includes(evidencia)) voltar(id, { erro: "Evidência inválida." });
  await chamar(id, "cumprir_prazo", { p_id: id, p_evidencia: evidencia }, "Prazo marcado como cumprido.");
}

/** confirmado | prorrogado | vencido → cancelado, com motivo. */
export async function cancelarPrazo(fd: FormData) {
  const id = lerId(fd);
  const motivo = texto(fd, "motivo");
  if (!motivo) voltar(id, { erro: "Informe o motivo do cancelamento." });
  await chamar(id, "cancelar_prazo", { p_id: id, p_motivo: motivo }, "Prazo cancelado.");
}
