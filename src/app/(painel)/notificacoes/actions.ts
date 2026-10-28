"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirSessao } from "@/server/sessao";

export async function marcarLida(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  const supabase = await criarClienteServidor();
  await supabase.rpc("marcar_notificacao_lida", { p_id: id });
  revalidatePath("/notificacoes");
  revalidatePath("/", "layout");
}

export async function marcarTodasLidas() {
  const sessao = await exigirSessao();
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("notificacoes").select("id").eq("destinatario_id", sessao.usuarioId).eq("canal", "painel").is("lida_em", null).limit(200);
  for (const n of data ?? []) await supabase.rpc("marcar_notificacao_lida", { p_id: n.id });
  revalidatePath("/notificacoes");
  revalidatePath("/", "layout");
}
