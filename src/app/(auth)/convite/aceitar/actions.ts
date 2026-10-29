"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Aceite explícito de um convite pendente: só a própria pessoa, logada, aceita (RPC aceitar_convite checa auth.uid()).
 * Depois do aceite a sessão é renovada para o JWT já trazer o escritório e o papel.
 */
export async function aceitarConvite(fd: FormData) {
  const escritorioId = z.uuid().safeParse(String(fd.get("escritorio_id") ?? ""));
  if (!escritorioId.success) redirect("/convite/aceitar?erro=" + encodeURIComponent("Convite inválido."));
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("aceitar_convite", { p_escritorio_id: escritorioId.data });
  if (error) redirect("/convite/aceitar?erro=" + encodeURIComponent(`Não foi possível aceitar: ${error.message}`));
  if (!data) redirect("/convite/aceitar?erro=" + encodeURIComponent("Este convite não está mais pendente."));
  await supabase.auth.refreshSession();
  redirect("/hoje");
}
