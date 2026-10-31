"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { envServidor } from "@/lib/config/env";
import { destinoSeguro } from "@/lib/seguranca/destino-seguro";

export async function entrarComLink(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const voltar = destinoSeguro(fd.get("voltar"));
  if (!email) redirect("/login?erro=Informe%20o%20e-mail");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${envServidor().APP_URL}/auth/callback?voltar=${encodeURIComponent(voltar)}`, shouldCreateUser: false },
  });
  if (error) redirect(`/login?erro=${encodeURIComponent("Não foi possível enviar o link. Confira o e-mail com o escritório.")}`);
  redirect("/login?enviado=1");
}

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
