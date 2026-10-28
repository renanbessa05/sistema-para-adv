"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * ref.feriados e ref.calendario_anos são globais e só a service role escreve (migration 0002).
 * A action confere o papel (sócio ou administrativo, docs/regras/permissoes.md) e valida o tribunal/comarca
 * com o cliente do usuário antes de escrever com o admin.
 */

function t(fd: FormData, n: string): string {
  const v = fd.get(n);
  return typeof v === "string" ? v.trim() : "";
}
function destino(ano: string | number): string {
  return `/configuracoes/calendario?ano=${ano}`;
}
function falhar(ano: string | number, mensagem: string): never {
  redirect(`${destino(ano)}&erro=${encodeURIComponent(mensagem)}`);
}
function concluir(ano: string | number, mensagem: string): never {
  redirect(`${destino(ano)}&ok=${encodeURIComponent(mensagem)}`);
}
function podeEditarCalendario(papel: string): boolean {
  return papel === "socio" || papel === "administrativo";
}

const esquemaFeriado = z.object({
  tribunal_id: z.string().uuid(),
  comarca_id: z.string().uuid().nullable(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  descricao: z.string().min(3, "Informe a descrição"),
  abrangencia: z.enum(["nacional", "estadual", "municipal", "forense", "recesso", "suspensao_ad_hoc"]),
  suspende_prazo: z.boolean(),
  ato_normativo: z.string().min(3, "Informe o ato normativo (portaria, provimento, decisão)"),
  url_fonte: z.string().url("URL da fonte inválida").nullable(),
});

export async function adicionarFeriado(fd: FormData) {
  const sessao = await exigirSessao();
  const anoTexto = t(fd, "data").slice(0, 4) || String(new Date().getFullYear());
  if (!podeEditarCalendario(sessao.papel)) falhar(anoTexto, "Só sócio ou administrativo altera o calendário forense.");
  const lido = esquemaFeriado.safeParse({
    tribunal_id: t(fd, "tribunal_id"),
    comarca_id: t(fd, "comarca_id") || null,
    data: t(fd, "data"),
    descricao: t(fd, "descricao"),
    abrangencia: t(fd, "abrangencia") || "forense",
    suspende_prazo: fd.get("suspende_prazo") !== "off" && fd.get("suspende_prazo") !== "0",
    ato_normativo: t(fd, "ato_normativo"),
    url_fonte: t(fd, "url_fonte") || null,
  });
  if (!lido.success) falhar(anoTexto, lido.error.issues[0]?.message ?? "Dados inválidos");
  if (lido.data.abrangencia === "municipal" && !lido.data.comarca_id) falhar(anoTexto, "Feriado municipal exige a comarca.");

  // Valida tribunal e comarca pelo cliente do usuário (leitura pública de ref)
  const supabase = await criarClienteServidor();
  const { data: tribunal } = await supabase.schema("ref").from("tribunais").select("id").eq("id", lido.data.tribunal_id).maybeSingle();
  if (!tribunal) falhar(anoTexto, "Tribunal não encontrado.");
  if (lido.data.comarca_id) {
    const { data: comarca } = await supabase.schema("ref").from("comarcas").select("id").eq("id", lido.data.comarca_id).eq("tribunal_id", lido.data.tribunal_id).maybeSingle();
    if (!comarca) falhar(anoTexto, "Comarca não pertence ao tribunal.");
  }

  const admin = criarClienteAdmin();
  const { error } = await admin.schema("ref").from("feriados").insert({ ...lido.data, conferido: false, criado_por: sessao.usuarioId });
  if (error) falhar(anoTexto, /unique|duplicate/i.test(error.message) ? "Já existe este feriado nesta data." : `Não foi possível gravar: ${error.message}`);
  // Garante a linha do ano (não conferido) para o motor saber que há dados do ano
  await admin.schema("ref").from("calendario_anos").upsert({ tribunal_id: lido.data.tribunal_id, ano: Number(anoTexto), conferido: false }, { onConflict: "tribunal_id,ano", ignoreDuplicates: true });
  revalidatePath("/configuracoes/calendario");
  revalidatePath("/hoje");
  concluir(anoTexto, "Dia sem expediente adicionado.");
}

export async function removerFeriado(feriadoId: string, ano: string) {
  const sessao = await exigirSessao();
  if (!podeEditarCalendario(sessao.papel)) falhar(ano, "Só sócio ou administrativo altera o calendário forense.");
  const admin = criarClienteAdmin();
  const { error } = await admin.schema("ref").from("feriados").delete().eq("id", feriadoId);
  if (error) falhar(ano, `Não foi possível remover: ${error.message}`);
  revalidatePath("/configuracoes/calendario");
  concluir(ano, "Registro removido.");
}

export async function marcarAnoConferido(fd: FormData) {
  const sessao = await exigirSessao();
  const ano = Number(t(fd, "ano"));
  if (!podeEditarCalendario(sessao.papel)) falhar(ano, "Só sócio ou administrativo altera o calendário forense.");
  const lido = z
    .object({ tribunal_id: z.string().uuid(), ano: z.number().int().min(2000).max(2100), conferido: z.boolean(), ato_normativo: z.string().nullable(), url_fonte: z.string().url("URL da fonte inválida").nullable(), observacoes: z.string().nullable() })
    .safeParse({ tribunal_id: t(fd, "tribunal_id"), ano, conferido: fd.get("conferido") === "on", ato_normativo: t(fd, "ato_normativo") || null, url_fonte: t(fd, "url_fonte") || null, observacoes: t(fd, "observacoes") || null });
  if (!lido.success) falhar(ano, lido.error.issues[0]?.message ?? "Dados inválidos");
  if (lido.data.conferido && !lido.data.ato_normativo) falhar(ano, "Para marcar o ano como conferido, informe a Portaria do TJ-MT usada na conferência.");
  const admin = criarClienteAdmin();
  const { error } = await admin.schema("ref").from("calendario_anos").upsert({ ...lido.data, atualizado_em: new Date().toISOString() }, { onConflict: "tribunal_id,ano" });
  if (error) falhar(ano, `Não foi possível gravar: ${error.message}`);
  if (lido.data.conferido) {
    await admin.schema("ref").from("feriados").update({ conferido: true }).eq("tribunal_id", lido.data.tribunal_id).gte("data", `${ano}-01-01`).lte("data", `${ano}-12-31`);
  }
  revalidatePath("/configuracoes/calendario");
  revalidatePath("/hoje");
  concluir(ano, lido.data.conferido ? `Calendário de ${ano} marcado como conferido.` : `Registro do ano ${ano} salvo (não conferido).`);
}
