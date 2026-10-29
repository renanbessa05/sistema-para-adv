"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import mammoth from "mammoth";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { enviarDocumento, ErroDocumento } from "@/server/documentos";

const DESTINO = "/configuracoes/modelos";

export async function novoModeloAction(fd: FormData) {
  const sessao = await exigirSessao();
  if (!["socio", "advogado"].includes(sessao.papel)) redirect(`${DESTINO}?erro=${encodeURIComponent("Só sócio ou advogado cadastra modelos.")}`);
  const nome = String(fd.get("nome") ?? "").trim();
  const tipoPeca = String(fd.get("tipo_peca") ?? "").trim() || null;
  const area = String(fd.get("area") ?? "").trim() || null;
  let estrutura = String(fd.get("estrutura_md") ?? "").trim() || null;
  const arquivo = fd.get("arquivo");
  if (!nome) redirect(`${DESTINO}?erro=${encodeURIComponent("Informe o nome do modelo.")}`);
  let documentoId: string | null = null;
  try {
    if (arquivo instanceof File && arquivo.size > 0) {
      const doc = await enviarDocumento(sessao, { arquivo, tipo: "outro", origem: "upload" });
      documentoId = doc.id;
      if (!estrutura) {
        const { value } = await mammoth.extractRawText({ buffer: Buffer.from(await arquivo.arrayBuffer()) });
        estrutura = value.slice(0, 60_000);
      }
    }
    if (!estrutura && !documentoId) redirect(`${DESTINO}?erro=${encodeURIComponent("Envie um .docx ou cole a estrutura.")}`);
    const supabase = await criarClienteServidor();
    const { error } = await supabase.from("modelos_peca").insert({ escritorio_id: sessao.escritorioId, nome, tipo_peca: tipoPeca, area, documento_id: documentoId, estrutura_md: estrutura, criado_por: sessao.usuarioId });
    if (error) throw new Error(error.message);
  } catch (e) {
    redirect(`${DESTINO}?erro=${encodeURIComponent(e instanceof ErroDocumento || e instanceof Error ? e.message : String(e))}`);
  }
  revalidatePath(DESTINO);
  redirect(`${DESTINO}?ok=${encodeURIComponent("Modelo salvo.")}`);
}

export async function desativarModeloAction(id: string) {
  const sessao = await exigirSessao();
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("modelos_peca").update({ ativo: false }).eq("id", id).eq("escritorio_id", sessao.escritorioId);
  if (error) redirect(`${DESTINO}?erro=${encodeURIComponent(error.message)}`);
  revalidatePath(DESTINO);
  redirect(`${DESTINO}?ok=${encodeURIComponent("Modelo desativado.")}`);
}
