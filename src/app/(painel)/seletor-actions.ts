"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Troca o escritório ativo. A RPC só aceita vínculo ativo ou acesso de suporte vigente. */
export async function trocarEscritorio(fd: FormData) {
  const id = String(fd.get("escritorio_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/hoje");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("trocar_escritorio", { p_escritorio: id });
  if (error) throw new Error(error.message);
  // Renova o JWT para o hook gravar o novo escritorio_id e papel.
  await supabase.auth.refreshSession();
  redirect("/hoje");
}
