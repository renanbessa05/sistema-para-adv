"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TIPOS_INTEGRACAO_COM_SEGREDO } from "@/lib/integracoes";

const DESTINO = "/configuracoes/integracoes";

function falhar(mensagem: string): never {
  redirect(`${DESTINO}?erro=${encodeURIComponent(mensagem)}`);
}

const esquemaSalvar = z.object({
  tipo: z.enum(TIPOS_INTEGRACAO_COM_SEGREDO),
  segredo: z.string().trim().min(8, "O segredo parece curto demais; copie o valor completo."),
  phone_number_id: z
    .string()
    .trim()
    .regex(/^\d*$/, "Phone number ID só tem dígitos.")
    .optional(),
});

/**
 * Grava o segredo no Vault pela RPC `integracao_definir_segredo` (só sócio, no banco e aqui).
 * O valor só trafega para o banco; nunca volta para a tela nem entra em mensagens de erro ou logs.
 */
export async function salvarSegredo(fd: FormData) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") falhar("Só o sócio altera as integrações.");
  const t = (n: string) => (typeof fd.get(n) === "string" ? String(fd.get(n)) : "");
  const lido = esquemaSalvar.safeParse({ tipo: t("tipo"), segredo: t("segredo"), phone_number_id: t("phone_number_id") || undefined });
  if (!lido.success) falhar(lido.error.issues[0]?.message ?? "Dados inválidos.");
  const { tipo, segredo, phone_number_id } = lido.data;
  const config: Record<string, string> = {};
  if (tipo === "whatsapp") {
    if (!phone_number_id) falhar("Informe o phone number ID do número do WhatsApp.");
    config.phone_number_id = phone_number_id;
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("integracao_definir_segredo", { p_tipo: tipo, p_segredo: segredo, p_config: config });
  if (error) falhar(/Vault indispon/i.test(error.message) ? "O Vault não está habilitado neste banco. Enquanto isso, a chave continua valendo pela variável de ambiente na Vercel." : `Não foi possível gravar: ${error.message}`);
  revalidatePath(DESTINO);
  redirect(`${DESTINO}?ok=${encodeURIComponent(`Segredo do ${tipo === "whatsapp" ? "WhatsApp" : "DataJud"} gravado no Vault.`)}`);
}

/** Apaga o segredo do Vault e deixa a integração inativa. A variável de ambiente, se existir, volta a valer. */
export async function removerSegredo(fd: FormData) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") falhar("Só o sócio altera as integrações.");
  const lido = z.object({ tipo: z.enum(TIPOS_INTEGRACAO_COM_SEGREDO) }).safeParse({ tipo: fd.get("tipo") });
  if (!lido.success) falhar("Integração inválida.");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("integracao_remover_segredo", { p_tipo: lido.data.tipo });
  if (error) falhar(`Não foi possível remover: ${error.message}`);
  revalidatePath(DESTINO);
  redirect(`${DESTINO}?ok=${encodeURIComponent(`Segredo do ${lido.data.tipo === "whatsapp" ? "WhatsApp" : "DataJud"} removido do Vault.`)}`);
}
