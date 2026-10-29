"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/server/sessao";
import { ErroContrato, salvarTimbre } from "@/server/contratos";

const CAMPOS = ["endereco", "bairro", "cidade", "uf", "cep", "telefone", "email", "site", "advogadaNome", "advogadaOab", "advogadaNacionalidade", "advogadaEstadoCivil", "advogadaCpf", "advogadaEmail"] as const;

export async function salvarTimbreAction(fd: FormData) {
  const sessao = await exigirSessao();
  const timbre: Record<string, string | null> = {};
  for (const c of CAMPOS) {
    const v = String(fd.get(c) ?? "").trim();
    timbre[c] = v || null;
  }
  try {
    await salvarTimbre(sessao, timbre);
  } catch (e) {
    redirect(`/configuracoes/documentos?erro=${encodeURIComponent(e instanceof ErroContrato ? e.message : String(e))}`);
  }
  revalidatePath("/configuracoes/documentos");
  redirect(`/configuracoes/documentos?ok=${encodeURIComponent("Timbre salvo.")}`);
}
