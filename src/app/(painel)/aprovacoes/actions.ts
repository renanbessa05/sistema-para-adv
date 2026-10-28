"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { mensagemErroBanco } from "@/server/publicacoes";

const Schema = z.object({
  id: z.uuid(),
  decisao: z.enum(["aprovada", "rejeitada", "ajustada"]),
  comentario: z.string().trim().max(2000).default(""),
  ajustes: z.string().trim().max(5000).default(""),
});

function voltar(params: { erro?: string; ok?: string; aba?: string }): never {
  const q = new URLSearchParams();
  if (params.aba) q.set("aba", params.aba);
  if (params.erro) q.set("erro", params.erro);
  if (params.ok) q.set("ok", params.ok);
  redirect(`/aprovacoes?${q.toString()}`);
}

/** Ajustes digitados: JSON válido vai como está; texto livre vira { descricao }. */
function interpretarAjustes(texto: string): Record<string, unknown> | null {
  if (!texto) return null;
  try {
    const v: unknown = JSON.parse(texto);
    if (typeof v === "object" && v !== null && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // texto livre
  }
  return { descricao: texto };
}

/** Aprovar, rejeitar ou ajustar pela RPC `decidir_aprovacao` (só advogado ou sócio; para prazo, só quem pode agir no processo). */
export async function decidirAprovacao(fd: FormData) {
  const parsed = Schema.safeParse({
    id: fd.get("id"),
    decisao: fd.get("decisao"),
    comentario: fd.get("comentario") ?? "",
    ajustes: fd.get("ajustes") ?? "",
  });
  if (!parsed.success) voltar({ erro: "Dados da decisão inválidos." });
  const v = parsed.data;
  const ajustes = interpretarAjustes(v.ajustes);
  if (v.decisao === "ajustada" && !ajustes) voltar({ erro: "Para ajustar, descreva o ajuste." });

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("decidir_aprovacao", {
    p_id: v.id,
    p_decisao: v.decisao,
    p_comentario: v.comentario || null,
    p_ajustes: v.decisao === "ajustada" ? ajustes : null,
    p_tempo_economizado_min: null,
  });
  if (error) voltar({ erro: mensagemErroBanco(error) });

  revalidatePath("/aprovacoes");
  revalidatePath("/hoje");
  const rotulo = { aprovada: "aprovada", rejeitada: "rejeitada", ajustada: "ajustada" }[v.decisao];
  voltar({ ok: `Solicitação ${rotulo}.` });
}
