"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { destinoSeguro } from "@/lib/seguranca/destino-seguro";
import { enviarDocumento, ErroDocumento, removerDocumento, urlAssinada } from "@/server/documentos";

const TIPOS = ["autos", "anexo", "peca", "contrato", "procuracao", "declaracao", "outro"] as const;

function mensagem(e: unknown): string {
  if (e instanceof ErroDocumento) return e.message;
  return e instanceof Error ? e.message : String(e);
}

/** Upload a partir das telas de processo e de cliente. O formulário traz `voltar` (página de origem). */
export async function enviarDocumentoAction(fd: FormData) {
  const sessao = await exigirSessao();
  const voltar = destinoSeguro(fd.get("voltar"));
  const arquivo = fd.get("arquivo");
  const campos = z
    .object({
      tipo: z.enum(TIPOS).default("anexo"),
      processo_id: z.uuid().optional().or(z.literal("")),
      cliente_id: z.uuid().optional().or(z.literal("")),
    })
    .safeParse({ tipo: fd.get("tipo") ?? "anexo", processo_id: fd.get("processo_id") ?? "", cliente_id: fd.get("cliente_id") ?? "" });
  if (!campos.success) redirect(`${voltar}?erro=${encodeURIComponent("Dados do documento inválidos.")}`);
  if (!(arquivo instanceof File) || arquivo.size === 0) redirect(`${voltar}?erro=${encodeURIComponent("Escolha um arquivo.")}`);
  try {
    await enviarDocumento(sessao, { arquivo, tipo: campos.data.tipo, processoId: campos.data.processo_id || null, clienteId: campos.data.cliente_id || null });
  } catch (e) {
    redirect(`${voltar}?erro=${encodeURIComponent(mensagem(e))}`);
  }
  revalidatePath(voltar);
  redirect(`${voltar}?ok=${encodeURIComponent("Documento enviado. O texto é extraído em alguns minutos.")}`);
}

/** Gera a URL assinada (60 s) e redireciona para o download, com auditoria. */
export async function baixarDocumentoAction(documentoId: string, fd: FormData) {
  await exigirSessao();
  const voltar = destinoSeguro(fd.get("voltar"));
  let url: string;
  try {
    const supabase = await criarClienteServidor();
    url = await urlAssinada(supabase, documentoId);
  } catch (e) {
    redirect(`${voltar}?erro=${encodeURIComponent(mensagem(e))}`);
  }
  redirect(url);
}

export async function removerDocumentoAction(documentoId: string, fd: FormData) {
  await exigirSessao();
  const voltar = destinoSeguro(fd.get("voltar"));
  try {
    const supabase = await criarClienteServidor();
    await removerDocumento(supabase, documentoId);
  } catch (e) {
    redirect(`${voltar}?erro=${encodeURIComponent(mensagem(e))}`);
  }
  revalidatePath(voltar);
  redirect(`${voltar}?ok=${encodeURIComponent("Documento removido.")}`);
}
