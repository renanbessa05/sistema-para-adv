"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/server/sessao";
import { abrirConversa, continuarEmNovaConversa, encerrarConversa, ErroAssistente, renomearConversa } from "@/server/assistente";

function mensagem(e: unknown): string {
  return e instanceof ErroAssistente || e instanceof Error ? e.message : String(e);
}

export async function novaConversaAction(fd: FormData) {
  const sessao = await exigirSessao();
  const campos = z.object({ titulo: z.string().trim().max(120).optional(), processo_id: z.uuid().optional().or(z.literal("")) }).safeParse({ titulo: fd.get("titulo") ?? "", processo_id: fd.get("processo_id") ?? "" });
  if (!campos.success) redirect(`/assistente?erro=${encodeURIComponent("Dados inválidos.")}`);
  let id: string;
  try {
    id = await abrirConversa(sessao, { titulo: campos.data.titulo || null, processoId: campos.data.processo_id || null });
  } catch (e) {
    redirect(`/assistente?erro=${encodeURIComponent(mensagem(e))}`);
  }
  revalidatePath("/assistente");
  redirect(`/assistente/${id}`);
}

export async function renomearConversaAction(conversaId: string, fd: FormData) {
  const sessao = await exigirSessao();
  const titulo = String(fd.get("titulo") ?? "").trim().slice(0, 120);
  try {
    await renomearConversa(sessao, conversaId, titulo);
  } catch (e) {
    redirect(`/assistente/${conversaId}?erro=${encodeURIComponent(mensagem(e))}`);
  }
  revalidatePath(`/assistente/${conversaId}`);
  redirect(`/assistente/${conversaId}`);
}

export async function encerrarConversaAction(conversaId: string) {
  const sessao = await exigirSessao();
  try {
    await encerrarConversa(sessao, conversaId);
  } catch (e) {
    redirect(`/assistente/${conversaId}?erro=${encodeURIComponent(mensagem(e))}`);
  }
  revalidatePath("/assistente");
  redirect("/assistente");
}

/** Abre outra conversa carregando um resumo desta (histórico longo). */
export async function continuarEmNovaAction(conversaId: string) {
  const sessao = await exigirSessao();
  let nova: string;
  try {
    nova = await continuarEmNovaConversa(sessao, conversaId);
  } catch (e) {
    redirect(`/assistente/${conversaId}?erro=${encodeURIComponent(mensagem(e))}`);
  }
  revalidatePath("/assistente");
  redirect(`/assistente/${nova}`);
}
