"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { validarMotivoAcesso } from "@/lib/planos/limites";

const DESTINO = "/configuracoes/plano";

function volta(tipo: "erro" | "ok", mensagem: string): never {
  revalidatePath(DESTINO);
  redirect(`${DESTINO}?${tipo}=${encodeURIComponent(mensagem)}`);
}

/** Concede acesso de suporte ao escritório atual. Só sócio; a RPC repete a checagem com MFA. */
export async function concederAcessoSuporte(fd: FormData) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") volta("erro", "Só o sócio concede acesso de suporte.");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const dias = Number(fd.get("dias") ?? 0);
  const motivo = String(fd.get("motivo") ?? "");
  if (!email.includes("@")) volta("erro", "Informe o e-mail da conta de suporte.");
  if (!Number.isInteger(dias) || dias < 1 || dias > 30) volta("erro", "A validade pode ir de 1 a 30 dias.");
  const erroMotivo = validarMotivoAcesso(motivo);
  if (erroMotivo) volta("erro", erroMotivo);
  const expiraEm = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("conceder_acesso_suporte", { p_email: email, p_expira_em: expiraEm, p_motivo: motivo.trim() });
  if (error) volta("erro", error.message);
  volta("ok", "Acesso de suporte concedido. Ele vale até a data indicada e pode ser revogado a qualquer momento.");
}

export async function revogarAcessoSuporte(fd: FormData) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") volta("erro", "Só o sócio revoga acesso de suporte.");
  const id = String(fd.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) volta("erro", "Acesso inválido.");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("revogar_acesso_suporte", { p_id: id });
  if (error) volta("erro", error.message);
  volta("ok", "Acesso revogado.");
}
