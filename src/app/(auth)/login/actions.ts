"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { envServidor } from "@/lib/config/env";

function destinoSeguro(voltar: FormDataEntryValue | null): string {
  const v = typeof voltar === "string" ? voltar : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/hoje";
}

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

export async function entrarComSenha(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const senha = String(fd.get("senha") ?? "");
  const voltar = destinoSeguro(fd.get("voltar"));
  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) redirect(`/login?erro=${encodeURIComponent("E-mail ou senha inválidos.")}`);
  redirect(voltar);
}

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
