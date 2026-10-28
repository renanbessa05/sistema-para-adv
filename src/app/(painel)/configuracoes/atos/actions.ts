"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

const DESTINO = "/configuracoes/atos";

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

const esquema = z.object({
  nome: z.string().min(2, "Informe o nome do ato"),
  sinonimos: z.array(z.string().min(1)),
  dias: z.coerce.number().int().min(1, "Dias deve ser maior que zero"),
  contagem: z.enum(["dias_uteis", "dias_corridos", "horas"]),
  dobro_padrao: z.boolean(),
  dias_seguranca: z.coerce.number().int().min(0, "Dias de segurança não podem ser negativos"),
  fundamento_legal: z.string().nullable(),
  ativo: z.boolean(),
});

function ler(fd: FormData) {
  return esquema.safeParse({
    nome: t(fd, "nome"),
    sinonimos: t(fd, "sinonimos")
      .split(/[;\n|]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    dias: t(fd, "dias"),
    contagem: t(fd, "contagem") || "dias_uteis",
    dobro_padrao: fd.get("dobro_padrao") === "on",
    dias_seguranca: t(fd, "dias_seguranca") || "2",
    fundamento_legal: t(fd, "fundamento_legal") || null,
    ativo: fd.get("ativo") !== "0",
  });
}

export async function criarAto(fd: FormData) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") falhar("Só o sócio edita os atos.");
  const lido = ler(fd);
  if (!lido.success) falhar(lido.error.issues[0]?.message ?? "Dados inválidos");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("atos_prazo").insert({ escritorio_id: sessao.escritorioId, ...lido.data });
  if (error) falhar(/unique|duplicate/i.test(error.message) ? "Já existe ato com este nome." : `Não foi possível criar: ${error.message}`);
  revalidatePath(DESTINO);
  concluir("Ato criado.");
}

export async function editarAto(atoId: string, fd: FormData) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") falhar("Só o sócio edita os atos.");
  const lido = ler(fd);
  if (!lido.success) falhar(lido.error.issues[0]?.message ?? "Dados inválidos");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("atos_prazo").update(lido.data).eq("id", atoId).eq("escritorio_id", sessao.escritorioId);
  if (error) falhar(/unique|duplicate/i.test(error.message) ? "Já existe ato com este nome." : `Não foi possível salvar: ${error.message}`);
  revalidatePath(DESTINO);
  concluir("Ato atualizado.");
}

/** Desativar em vez de apagar: prazos antigos referenciam o ato. Apagar só quando nunca foi usado. */
export async function alternarAtivoAto(atoId: string, ativo: boolean) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") falhar("Só o sócio edita os atos.");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("atos_prazo").update({ ativo }).eq("id", atoId).eq("escritorio_id", sessao.escritorioId);
  if (error) falhar(`Não foi possível alterar: ${error.message}`);
  revalidatePath(DESTINO);
  concluir(ativo ? "Ato reativado." : "Ato desativado (deixa de ser sugerido; prazos antigos continuam ligados a ele).");
}

export async function excluirAto(atoId: string) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") falhar("Só o sócio edita os atos.");
  const supabase = await criarClienteServidor();
  const { count } = await supabase.from("prazos").select("id", { count: "exact", head: true }).eq("ato_id", atoId);
  if (count && count > 0) falhar(`Este ato está ligado a ${count} prazo(s): desative em vez de excluir.`);
  const { error } = await supabase.from("atos_prazo").delete().eq("id", atoId).eq("escritorio_id", sessao.escritorioId);
  if (error) falhar(`Não foi possível excluir: ${error.message}`);
  revalidatePath(DESTINO);
  concluir("Ato excluído.");
}
