"use server";

import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { ErroRevisao, resolverItem, revisarTexto } from "@/server/revisoes";

function t(fd: FormData, n: string): string {
  const v = fd.get(n);
  return typeof v === "string" ? v.trim() : "";
}

export async function revisarAction(fd: FormData) {
  const sessao = await exigirSessao();
  const texto = t(fd, "texto");
  const tipoPeca = t(fd, "tipo_peca") || "outro";
  const grau = t(fd, "grau") === "segundo" ? "segundo" : "primeiro";
  const cnj = t(fd, "cnj") || null;
  let id: string;
  try {
    id = await revisarTexto(sessao, { texto, tipoPeca, grau, processoCnj: cnj, origem: "colada" });
  } catch (e) {
    redirect(`/revisor?erro=${encodeURIComponent(e instanceof ErroRevisao || e instanceof Error ? e.message : String(e))}`);
  }
  redirect(`/revisor?rev=${id}`);
}

export async function resolverItemAction(revisaoId: string, item: string, fd: FormData) {
  await exigirSessao();
  try {
    await resolverItem(revisaoId, item, t(fd, "justificativa"));
  } catch (e) {
    redirect(`/revisor?rev=${revisaoId}&erro=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
  redirect(`/revisor?rev=${revisaoId}`);
}
