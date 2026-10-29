"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

export interface EstadoCodigo {
  erro?: string;
  codigo?: string;
}

function destino(clienteId: string, query: string) {
  return `/clientes/${clienteId}?${query}`;
}

function podeGerir(papel: string) {
  return papel === "socio" || papel === "advogado";
}

/** Cadastra um telefone de cliente (ainda não verificado nem autorizado). */
export async function adicionarContato(fd: FormData) {
  const sessao = await exigirSessao();
  const clienteId = String(fd.get("cliente_id") ?? "");
  if (!podeGerir(sessao.papel)) redirect(destino(clienteId, `erro=${encodeURIComponent("Só advogado ou sócio cadastra contatos de cliente.")}`));
  const bruto = String(fd.get("telefone") ?? "").replace(/[^\d+]/g, "");
  const telefone = bruto.startsWith("+") ? bruto : `+55${bruto}`;
  if (!/^\+[1-9]\d{7,14}$/.test(telefone)) redirect(destino(clienteId, `erro=${encodeURIComponent("Telefone inválido. Use DDI+DDD+número, ex.: +5565999990000.")}`));
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("clientes_contatos").insert({ escritorio_id: sessao.escritorioId, cliente_id: clienteId, telefone_e164: telefone });
  if (error) redirect(destino(clienteId, `erro=${encodeURIComponent(`Não foi possível cadastrar: ${error.message}`)}`));
  revalidatePath(`/clientes/${clienteId}`);
  redirect(destino(clienteId, `ok=${encodeURIComponent("Contato cadastrado. Gere o código de verificação para confirmar o número.")}`));
}

/** Gera o código de verificação (30 min). Devolve o código ao painel; não vai para a URL. */
export async function gerarCodigoContato(_estado: EstadoCodigo, fd: FormData): Promise<EstadoCodigo> {
  const sessao = await exigirSessao();
  if (!podeGerir(sessao.papel)) return { erro: "Só advogado ou sócio gera o código." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("gerar_codigo_contato_cliente", { p_contato_id: String(fd.get("contato_id") ?? "") });
  if (error || typeof data !== "string") return { erro: `Não foi possível gerar o código: ${error?.message ?? "sem resposta"}` };
  return { codigo: data };
}

/** Autoriza (opt-in) ou revoga (opt-out) mensagens automáticas a um contato verificado. */
export async function alterarConsentimento(fd: FormData) {
  const sessao = await exigirSessao();
  const clienteId = String(fd.get("cliente_id") ?? "");
  if (!podeGerir(sessao.papel)) redirect(destino(clienteId, `erro=${encodeURIComponent("Só advogado ou sócio altera o consentimento.")}`));
  const concede = fd.get("concede") === "1";
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("cliente_contato_consentimento", { p_contato_id: String(fd.get("contato_id") ?? ""), p_concede: concede });
  if (error) redirect(destino(clienteId, `erro=${encodeURIComponent(error.message)}`));
  revalidatePath(`/clientes/${clienteId}`);
  redirect(destino(clienteId, `ok=${encodeURIComponent(concede ? "Autorização registrada." : "Autorização revogada.")}`));
}

/** Desativa um contato (não apaga: o histórico da conversa continua ligado ao cliente). */
export async function desativarContato(fd: FormData) {
  const sessao = await exigirSessao();
  const clienteId = String(fd.get("cliente_id") ?? "");
  if (!podeGerir(sessao.papel)) redirect(destino(clienteId, `erro=${encodeURIComponent("Só advogado ou sócio desativa contatos.")}`));
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("clientes_contatos").update({ ativo: false }).eq("id", String(fd.get("contato_id") ?? ""));
  if (error) redirect(destino(clienteId, `erro=${encodeURIComponent(error.message)}`));
  revalidatePath(`/clientes/${clienteId}`);
  redirect(destino(clienteId, `ok=${encodeURIComponent("Contato desativado.")}`));
}
