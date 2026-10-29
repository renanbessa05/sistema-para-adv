"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/server/sessao";
import { aprovarPontos, criarMinutaDaVarredura, criarVarredura, ErroVarredura, gerarVarredura } from "@/server/varreduras";
import { AREAS, TIPOS_PECA } from "@/lib/ia/schemas/minutas";

function t(fd: FormData, n: string): string {
  const v = fd.get(n);
  return typeof v === "string" ? v.trim() : "";
}
function falhar(destino: string, e: unknown): never {
  redirect(`${destino}?erro=${encodeURIComponent(e instanceof ErroVarredura || e instanceof Error ? e.message : String(e))}`);
}

export async function novaVarreduraAction(fd: FormData) {
  const sessao = await exigirSessao();
  const campos = z.object({ processo_id: z.uuid(), polo: z.string().min(2).max(80), objetivo: z.string().min(3).max(300) }).safeParse({ processo_id: t(fd, "processo_id"), polo: t(fd, "polo"), objetivo: t(fd, "objetivo") });
  if (!campos.success) redirect(`/varreduras/nova?erro=${encodeURIComponent("Informe processo, polo e objetivo da peça (Passo 0).")}`);
  let id: string;
  try {
    id = await criarVarredura(sessao, { processoId: campos.data.processo_id, polo: campos.data.polo, objetivo: campos.data.objetivo, prazoInicial: t(fd, "prazo_inicial") || null, prazoFinal: t(fd, "prazo_final") || null, documentoIds: fd.getAll("documento_ids").map(String).filter(Boolean) });
    await gerarVarredura(sessao, id);
  } catch (e) {
    if (typeof id! === "string") redirect(`/varreduras/${id!}?erro=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
    falhar("/varreduras/nova", e);
  }
  revalidatePath("/minutas");
  redirect(`/varreduras/${id}`);
}

export async function regerarVarreduraAction(analiseId: string) {
  const sessao = await exigirSessao();
  try {
    await gerarVarredura(sessao, analiseId);
  } catch (e) {
    falhar(`/varreduras/${analiseId}`, e);
  }
  revalidatePath(`/varreduras/${analiseId}`);
  redirect(`/varreduras/${analiseId}?ok=${encodeURIComponent("Varredura refeita.")}`);
}

export async function aprovarPontosAction(analiseId: string, fd: FormData) {
  const sessao = await exigirSessao();
  const numeros = fd.getAll("pontos").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
  try {
    await aprovarPontos(sessao, analiseId, numeros);
  } catch (e) {
    falhar(`/varreduras/${analiseId}`, e);
  }
  revalidatePath(`/varreduras/${analiseId}`);
  redirect(`/varreduras/${analiseId}?ok=${encodeURIComponent(`${numeros.length} ponto(s) aprovado(s).`)}`);
}

export async function redigirDaVarreduraAction(analiseId: string, fd: FormData) {
  const sessao = await exigirSessao();
  const campos = z.object({ tipo_peca: z.enum(TIPOS_PECA), area: z.enum(AREAS), titulo: z.string().min(3).max(160) }).safeParse({ tipo_peca: t(fd, "tipo_peca"), area: t(fd, "area"), titulo: t(fd, "titulo") });
  if (!campos.success) falhar(`/varreduras/${analiseId}`, new ErroVarredura("Informe tipo de peça, área e título."));
  let id: string;
  try {
    id = await criarMinutaDaVarredura(sessao, analiseId, { tipoPeca: campos.data.tipo_peca, area: campos.data.area, titulo: campos.data.titulo });
  } catch (e) {
    falhar(`/varreduras/${analiseId}`, e);
  }
  revalidatePath("/minutas");
  redirect(`/minutas/${id}?ok=${encodeURIComponent("Minuta criada com os pontos aprovados. Clique em 'Redigir com a IA'.")}`);
}
