"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/server/sessao";
import { ErroOutrosTribunais, gerarAnaliseOutrosTribunais } from "@/server/outros-tribunais";

function t(fd: FormData, n: string): string {
  const v = fd.get(n);
  return typeof v === "string" ? v.trim() : "";
}

export async function gerarOutrosTribunaisAction(processoId: string, fd: FormData) {
  const sessao = await exigirSessao();
  const polo = t(fd, "polo");
  const objetivo = t(fd, "objetivo");
  const prazo = t(fd, "prazo") || null;
  let mensagem: string | null = null;
  try {
    await gerarAnaliseOutrosTribunais(sessao, processoId, { polo, objetivo, prazoTermoFinal: prazo });
  } catch (e) {
    mensagem = e instanceof ErroOutrosTribunais ? e.message : "Falha ao gerar a análise.";
  }
  if (mensagem) redirect(`/processos/${processoId}/outros-tribunais?erro=${encodeURIComponent(mensagem)}`);
  revalidatePath(`/processos/${processoId}/outros-tribunais`);
  redirect(`/processos/${processoId}/outros-tribunais?ok=${encodeURIComponent("Análise gerada. Confira a camada local antes de qualquer protocolo.")}`);
}
