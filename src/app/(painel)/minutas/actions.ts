"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/server/sessao";
import { aprovarEtapa, arquivarMinuta, criarMinuta, devolverEtapa, enviarMinutaParaAprovacao, ErroMinuta, gerarEtapaComDocumentos, marcarProtocolada, novaVersaoManual, pularEtapas } from "@/server/minutas";
import { AREAS, TIPOS_PECA } from "@/lib/ia/schemas/minutas";

function t(fd: FormData, n: string): string {
  const v = fd.get(n);
  return typeof v === "string" ? v.trim() : "";
}
function falhar(destino: string, e: unknown): never {
  redirect(`${destino}?erro=${encodeURIComponent(e instanceof ErroMinuta || e instanceof Error ? e.message : String(e))}`);
}
function ok(destino: string, msg: string): never {
  redirect(`${destino}?ok=${encodeURIComponent(msg)}`);
}

export async function novaMinutaAction(fd: FormData) {
  const sessao = await exigirSessao();
  const campos = z
    .object({ processo_id: z.uuid().optional().or(z.literal("")), prazo_id: z.uuid().optional().or(z.literal("")), tipo_peca: z.enum(TIPOS_PECA), area: z.enum(AREAS), modo: z.enum(["A", "B", "C"]), titulo: z.string().min(3).max(160), relato: z.string().max(40000), rascunho: z.string().max(60000), grau: z.enum(["primeiro", "segundo"]) })
    .safeParse({ processo_id: t(fd, "processo_id"), prazo_id: t(fd, "prazo_id"), tipo_peca: t(fd, "tipo_peca"), area: t(fd, "area"), modo: t(fd, "modo"), titulo: t(fd, "titulo"), relato: t(fd, "relato"), rascunho: t(fd, "rascunho"), grau: t(fd, "grau") || "primeiro" });
  if (!campos.success) redirect(`/minutas/nova?erro=${encodeURIComponent("Preencha título, tipo de peça, área e modo.")}`);
  if (campos.data.modo === "B" && !campos.data.rascunho) redirect(`/minutas/nova?erro=${encodeURIComponent("No Modo B cole o rascunho.")}`);
  if (campos.data.modo !== "B" && campos.data.relato.length < 20) redirect(`/minutas/nova?erro=${encodeURIComponent("Escreva o relato do caso (ao menos 20 caracteres).")}`);
  let id: string;
  try {
    id = await criarMinuta(sessao, {
      processoId: campos.data.processo_id || null,
      prazoId: campos.data.prazo_id || null,
      tipoPeca: campos.data.tipo_peca,
      area: campos.data.area,
      modo: campos.data.modo,
      titulo: campos.data.titulo,
      relato: campos.data.relato,
      rascunho: campos.data.rascunho || null,
      pedidos: t(fd, "pedidos") || null,
      urgencia: t(fd, "urgencia") || null,
      peculiaridades: t(fd, "peculiaridades") || null,
      parteContraria: t(fd, "parte_contraria") || null,
      comarca: t(fd, "comarca") || null,
      vara: t(fd, "vara") || null,
      grau: campos.data.grau,
      documentoIds: fd.getAll("documento_ids").map(String).filter(Boolean),
    });
  } catch (e) {
    falhar("/minutas/nova", e);
  }
  revalidatePath("/minutas");
  redirect(`/minutas/${id}`);
}

export async function gerarEtapaAction(minutaId: string, numero: number) {
  const sessao = await exigirSessao();
  const n = Math.min(6, Math.max(1, Math.floor(numero))) as 1 | 2 | 3 | 4 | 5 | 6;
  try {
    await gerarEtapaComDocumentos(sessao, minutaId, n);
  } catch (e) {
    falhar(`/minutas/${minutaId}`, e);
  }
  revalidatePath(`/minutas/${minutaId}`);
  ok(`/minutas/${minutaId}`, n === 6 ? "Peça redigida. Revise o texto, a validação e gere o .docx." : `Etapa ${n} gerada. Leia e aprove, devolva com comentário ou pule.`);
}

export async function aprovarEtapaAction(minutaId: string, numero: number, fd: FormData) {
  await exigirSessao();
  try {
    await aprovarEtapa(minutaId, numero, t(fd, "comentario") || null);
  } catch (e) {
    falhar(`/minutas/${minutaId}`, e);
  }
  revalidatePath(`/minutas/${minutaId}`);
  ok(`/minutas/${minutaId}`, `Etapa ${numero} aprovada.`);
}

export async function devolverEtapaAction(minutaId: string, numero: number, fd: FormData) {
  await exigirSessao();
  try {
    await devolverEtapa(minutaId, numero, t(fd, "comentario"));
  } catch (e) {
    falhar(`/minutas/${minutaId}`, e);
  }
  revalidatePath(`/minutas/${minutaId}`);
  ok(`/minutas/${minutaId}`, `Etapa ${numero} devolvida. Gere de novo quando quiser.`);
}

export async function pularEtapasAction(minutaId: string, fd: FormData) {
  await exigirSessao();
  const ate = Number(t(fd, "ate"));
  try {
    await pularEtapas(minutaId, ate, t(fd, "motivo") || "pulada pela advogada");
  } catch (e) {
    falhar(`/minutas/${minutaId}`, e);
  }
  revalidatePath(`/minutas/${minutaId}`);
  ok(`/minutas/${minutaId}`, `Etapas puladas até a ${ate}. Fica registrado o que não foi checado.`);
}

export async function novaVersaoAction(minutaId: string, fd: FormData) {
  const sessao = await exigirSessao();
  const md = t(fd, "conteudo_md");
  if (md.length < 50) falhar(`/minutas/${minutaId}`, new ErroMinuta("Texto curto demais."));
  try {
    await novaVersaoManual(sessao, minutaId, md, t(fd, "resumo") || null);
  } catch (e) {
    falhar(`/minutas/${minutaId}`, e);
  }
  revalidatePath(`/minutas/${minutaId}`);
  ok(`/minutas/${minutaId}`, "Nova versão salva, validada e exportada em .docx.");
}

export async function enviarAprovacaoMinutaAction(minutaId: string, fd: FormData) {
  await exigirSessao();
  try {
    await enviarMinutaParaAprovacao(minutaId, t(fd, "comentario") || null);
  } catch (e) {
    falhar(`/minutas/${minutaId}`, e);
  }
  revalidatePath(`/minutas/${minutaId}`);
  revalidatePath("/aprovacoes");
  ok(`/minutas/${minutaId}`, "Enviada para aprovação.");
}

export async function marcarProtocoladaAction(minutaId: string, fd: FormData) {
  await exigirSessao();
  try {
    await marcarProtocolada(minutaId, t(fd, "numero_protocolo") || null);
  } catch (e) {
    falhar(`/minutas/${minutaId}`, e);
  }
  revalidatePath(`/minutas/${minutaId}`);
  ok(`/minutas/${minutaId}`, "Protocolo registrado.");
}

export async function arquivarMinutaAction(minutaId: string, fd: FormData) {
  const sessao = await exigirSessao();
  const status = t(fd, "status") === "cancelada" ? "cancelada" : "arquivada";
  try {
    await arquivarMinuta(sessao, minutaId, status);
  } catch (e) {
    falhar(`/minutas/${minutaId}`, e);
  }
  revalidatePath("/minutas");
  redirect("/minutas");
}
