"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { enviarConvite, reenviarAcessoPendente } from "@/server/equipe";

const DESTINO = "/configuracoes/equipe";

async function escritorioDaSessao(supabase: Awaited<ReturnType<typeof criarClienteServidor>>, id: string): Promise<{ id: string; nome: string }> {
  const { data } = await supabase.from("escritorios").select("nome").eq("id", id).maybeSingle();
  return { id, nome: (data?.nome as string | undefined) ?? "seu escritório" };
}

function t(fd: FormData, n: string): string {
  const v = fd.get(n);
  return typeof v === "string" ? v.trim() : "";
}
function falhar(mensagem: string): never {
  redirect(`${DESTINO}?erro=${encodeURIComponent(mensagem)}`);
}
function concluir(mensagem: string): never {
  redirect(`${DESTINO}?ok=${encodeURIComponent(mensagem)}`);
}

const esquemaConvite = z.object({
  email: z.string().email("E-mail inválido").transform((e) => e.toLowerCase()),
  nome_completo: z.string().min(3, "Informe o nome completo"),
  papel: z.enum(["socio", "advogado", "estagiario", "administrativo"]),
  oab_numero: z.string().nullable(),
  oab_uf: z.string().length(2, "UF da OAB com 2 letras").nullable(),
  oab_sufixo: z.string().nullable(),
  nomes_alternativos: z.array(z.string().min(1)),
});

/**
 * Convite: grava a linha em escritorio_membros com usuario_id nulo (RLS: só sócio) e manda o convite
 * pelo Auth (service role). A trigger vincular_membro_por_email liga o usuário ao aceitar.
 */
export async function convidarMembro(fd: FormData) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") falhar("Só o sócio convida membros.");
  const lido = esquemaConvite.safeParse({
    email: t(fd, "email"),
    nome_completo: t(fd, "nome_completo"),
    papel: t(fd, "papel") || "advogado",
    oab_numero: t(fd, "oab_numero").replace(/\D/g, "") || null,
    oab_uf: t(fd, "oab_uf").toUpperCase() || null,
    oab_sufixo: t(fd, "oab_sufixo").toUpperCase() || null,
    nomes_alternativos: t(fd, "nomes_alternativos")
      .split(/[;\n|]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  });
  if (!lido.success) falhar(lido.error.issues[0]?.message ?? "Dados inválidos");
  if ((lido.data.papel === "advogado" || lido.data.papel === "socio") && !lido.data.oab_numero) falhar("Advogado e sócio precisam de número da OAB (é com ele que o DJEN é consultado).");

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("escritorio_membros").insert({
    escritorio_id: sessao.escritorioId,
    usuario_id: null,
    email_convite: lido.data.email,
    papel: lido.data.papel,
    nome_completo: lido.data.nome_completo,
    oab_numero: lido.data.oab_numero,
    oab_uf: lido.data.oab_uf ?? (lido.data.oab_numero ? "MT" : null),
    oab_sufixo: lido.data.oab_sufixo,
    nomes_alternativos: lido.data.nomes_alternativos,
    ativo: true,
  });
  if (error) falhar(/unique|duplicate/i.test(error.message) ? "Já existe membro com este e-mail no escritório." : `Não foi possível gravar o membro: ${error.message}`);

  const convite = await enviarConvite(lido.data.email, await escritorioDaSessao(supabase, sessao.escritorioId));
  revalidatePath(DESTINO);
  if (!convite.ok) redirect(`${DESTINO}?ok=${encodeURIComponent("Membro gravado.")}&erro=${encodeURIComponent(convite.erro)}`);
  if (convite.aviso) redirect(`${DESTINO}?ok=${encodeURIComponent("Membro gravado.")}&aviso=${encodeURIComponent(convite.aviso)}`);
  concluir(`Convite enviado para ${lido.data.email}.`);
}

export async function reenviarConvite(membroId: string) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") falhar("Só o sócio reenvia convites.");
  const supabase = await criarClienteServidor();
  const { data: membro } = await supabase.from("escritorio_membros").select("email_convite, usuario_id, aceito_em").eq("id", membroId).eq("escritorio_id", sessao.escritorioId).maybeSingle();
  if (!membro) falhar("Membro não encontrado.");
  if (membro.aceito_em) falhar("Este membro já aceitou o convite.");
  const escritorio = await escritorioDaSessao(supabase, sessao.escritorioId);
  // usuario_id preenchido sem aceite = pessoa que já tinha conta e ainda não aceitou: só reenvia o e-mail de aceite
  const convite = membro.usuario_id ? await reenviarAcessoPendente(membro.email_convite as string, escritorio) : await enviarConvite(membro.email_convite as string, escritorio);
  if (!convite.ok) falhar(convite.erro);
  revalidatePath(DESTINO);
  if (convite.aviso) redirect(`${DESTINO}?aviso=${encodeURIComponent(convite.aviso)}`);
  concluir(`Convite reenviado para ${membro.email_convite}.`);
}

const esquemaEdicao = z.object({
  nome_completo: z.string().min(3, "Informe o nome completo"),
  papel: z.enum(["socio", "advogado", "estagiario", "administrativo"]),
  oab_numero: z.string().nullable(),
  oab_uf: z.string().length(2).nullable(),
  oab_sufixo: z.string().nullable(),
  nomes_alternativos: z.array(z.string().min(1)),
});

export async function editarMembro(membroId: string, fd: FormData) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") falhar("Só o sócio edita membros.");
  const lido = esquemaEdicao.safeParse({
    nome_completo: t(fd, "nome_completo"),
    papel: t(fd, "papel"),
    oab_numero: t(fd, "oab_numero").replace(/\D/g, "") || null,
    oab_uf: t(fd, "oab_uf").toUpperCase() || null,
    oab_sufixo: t(fd, "oab_sufixo").toUpperCase() || null,
    nomes_alternativos: t(fd, "nomes_alternativos")
      .split(/[;\n|]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  });
  if (!lido.success) falhar(lido.error.issues[0]?.message ?? "Dados inválidos");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("escritorio_membros").update(lido.data).eq("id", membroId).eq("escritorio_id", sessao.escritorioId);
  if (error) falhar(`Não foi possível salvar: ${error.message}`);
  revalidatePath(DESTINO);
  concluir("Membro atualizado. O papel novo vale no próximo login (até 1 h).");
}

export async function alternarAtivoMembro(membroId: string, ativo: boolean) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") falhar("Só o sócio ativa ou desativa membros.");
  const supabase = await criarClienteServidor();
  const { data: membro } = await supabase.from("escritorio_membros").select("usuario_id").eq("id", membroId).eq("escritorio_id", sessao.escritorioId).maybeSingle();
  if (!membro) falhar("Membro não encontrado.");
  if (!ativo && membro.usuario_id === sessao.usuarioId) falhar("Você não pode desativar o próprio acesso.");
  const { error } = await supabase.from("escritorio_membros").update({ ativo }).eq("id", membroId).eq("escritorio_id", sessao.escritorioId);
  if (error) falhar(`Não foi possível alterar: ${error.message}`);
  revalidatePath(DESTINO);
  concluir(ativo ? "Membro reativado." : "Membro desativado: perde o acesso no próximo refresh do token (até 1 h).");
}

// ---------- Telefone do WhatsApp (próprio; sócio pode revogar de outros) ----------

export type EstadoTelefone = { erro?: string; ok?: string; codigo?: string; telefone?: string; expiraEm?: string };

/** Cadastra o próprio telefone (E.164) e gera o código para digitar no WhatsApp. Resposta via useActionState (código não vai à URL). */
export async function cadastrarTelefone(_anterior: EstadoTelefone, fd: FormData): Promise<EstadoTelefone> {
  const sessao = await exigirSessao();
  const bruto = t(fd, "telefone").replace(/[^\d+]/g, "");
  const telefone = bruto.startsWith("+") ? bruto : `+55${bruto}`;
  if (!/^\+[1-9]\d{7,14}$/.test(telefone)) return { erro: "Telefone inválido. Use DDI+DDD+número, ex.: +5565999990000." };
  const supabase = await criarClienteServidor();
  const { data: existente } = await supabase.from("usuario_telefones").select("id, usuario_id, ativo").eq("telefone_e164", telefone).maybeSingle();
  let telefoneId: string;
  if (existente) {
    if (existente.usuario_id !== sessao.usuarioId) return { erro: "Este telefone já está cadastrado para outra pessoa." };
    telefoneId = existente.id as string;
    if (!existente.ativo) await supabase.from("usuario_telefones").update({ ativo: true }).eq("id", telefoneId);
  } else {
    await supabase.from("usuario_telefones").update({ principal: false }).eq("usuario_id", sessao.usuarioId).eq("escritorio_id", sessao.escritorioId);
    const { data, error } = await supabase.from("usuario_telefones").insert({ escritorio_id: sessao.escritorioId, usuario_id: sessao.usuarioId, telefone_e164: telefone, principal: true, ativo: true }).select("id").single();
    if (error || !data) return { erro: `Não foi possível cadastrar: ${error?.message ?? "erro"}` };
    telefoneId = data.id as string;
  }
  const { data: codigo, error: erroCodigo } = await supabase.rpc("gerar_codigo_telefone", { p_telefone_id: telefoneId });
  if (erroCodigo || !codigo) return { erro: `Não foi possível gerar o código: ${erroCodigo?.message ?? "erro"}` };
  revalidatePath(DESTINO);
  return { ok: "Telefone cadastrado.", codigo: String(codigo), telefone, expiraEm: new Date(Date.now() + 30 * 60 * 1000).toISOString() };
}

export async function gerarNovoCodigo(_anterior: EstadoTelefone, fd: FormData): Promise<EstadoTelefone> {
  await exigirSessao();
  const telefoneId = t(fd, "telefone_id");
  if (!/^[0-9a-f-]{36}$/i.test(telefoneId)) return { erro: "Telefone inválido." };
  const supabase = await criarClienteServidor();
  const { data: codigo, error } = await supabase.rpc("gerar_codigo_telefone", { p_telefone_id: telefoneId });
  if (error || !codigo) return { erro: `Não foi possível gerar o código: ${error?.message ?? "sem permissão"}` };
  return { ok: "Novo código gerado.", codigo: String(codigo), telefone: t(fd, "telefone"), expiraEm: new Date(Date.now() + 30 * 60 * 1000).toISOString() };
}

export async function removerTelefone(telefoneId: string) {
  const sessao = await exigirSessao();
  const supabase = await criarClienteServidor();
  // A policy telefones_proprio só deixa o dono ou o sócio alterar
  const { error } = await supabase.from("usuario_telefones").update({ ativo: false, verificado_em: null, codigo_verificacao_hash: null, codigo_expira_em: null }).eq("id", telefoneId).eq("escritorio_id", sessao.escritorioId);
  if (error) falhar(`Não foi possível remover: ${error.message}`);
  revalidatePath(DESTINO);
  concluir("Telefone removido.");
}
