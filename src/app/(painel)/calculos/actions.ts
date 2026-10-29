"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/server/sessao";
import { criarECalcular, enviarCalculoParaAprovacao, ErroCalculoServidor } from "@/server/calculos";
import type { ItemCalculo } from "@/lib/calculos/atualizar";

function t(fd: FormData, n: string): string {
  const v = fd.get(n);
  return typeof v === "string" ? v.trim() : "";
}

/** Uma linha por item: descrição;AAAA-MM-DD;valor (vírgula ou ponto decimal). */
function parsearItens(texto: string): ItemCalculo[] {
  const itens: ItemCalculo[] = [];
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  linhas.forEach((linha, i) => {
    const partes = linha.split(";").map((p) => p.trim());
    if (partes.length !== 3) throw new ErroCalculoServidor(`Linha ${i + 1}: use descrição;AAAA-MM-DD;valor`);
    const [descricao, data, valorBruto] = partes;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new ErroCalculoServidor(`Linha ${i + 1}: data deve ser AAAA-MM-DD`);
    const valor = Number(valorBruto.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) throw new ErroCalculoServidor(`Linha ${i + 1}: valor inválido`);
    itens.push({ descricao, dataInicial: data, valorOriginal: valor });
  });
  if (itens.length === 0) throw new ErroCalculoServidor("Informe ao menos um item.");
  return itens;
}

export async function novoCalculoAction(fd: FormData) {
  const sessao = await exigirSessao();
  let id: string;
  try {
    const taxa = t(fd, "taxa_informada");
    id = await criarECalcular(sessao, {
      titulo: t(fd, "titulo") || "Cálculo",
      regraCodigo: t(fd, "regra") || "civel_pre_14905",
      taxaInformada: taxa ? Number(taxa.replace(",", ".")) : null,
      processoId: t(fd, "processo_id") || null,
      dataFinal: t(fd, "data_final"),
      itens: parsearItens(t(fd, "itens")),
    });
  } catch (e) {
    redirect(`/calculos/novo?erro=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
  revalidatePath("/calculos");
  redirect(`/calculos/${id}`);
}

export async function enviarCalculoAction(id: string) {
  await exigirSessao();
  try {
    await enviarCalculoParaAprovacao(id);
  } catch (e) {
    redirect(`/calculos/${id}?erro=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
  revalidatePath("/aprovacoes");
  redirect(`/calculos/${id}?ok=${encodeURIComponent("Enviado para aprovação.")}`);
}
