"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/server/sessao";
import { ErroAnalise, gerarMapaJulgador } from "@/server/analises";

function t(fd: FormData, n: string): string {
  const v = fd.get(n);
  return typeof v === "string" ? v.trim() : "";
}

export async function gerarMapaJulgadorAction(processoId: string, fd: FormData) {
  const sessao = await exigirSessao();
  const foco = t(fd, "foco") || null;
  let mensagem: string | null = null;
  try {
    await gerarMapaJulgador(sessao, processoId, { foco });
  } catch (e) {
    mensagem = e instanceof ErroAnalise ? e.message : "Falha ao gerar o mapa.";
  }
  if (mensagem) redirect(`/processos/${processoId}/analises?erro=${encodeURIComponent(mensagem)}`);
  revalidatePath(`/processos/${processoId}/analises`);
  redirect(`/processos/${processoId}/analises?ok=${encodeURIComponent("Mapa gerado. É uma previsão para estudo, não uma decisão.")}`);
}
