"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

const DESTINO = "/configuracoes/ausencias";

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

const esquema = z
  .object({
    usuario_id: z.string().uuid("Escolha a pessoa"),
    inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de início inválida"),
    fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de fim inválida"),
    tipo: z.enum(["ferias", "licenca", "outro"]),
    substituto_id: z.string().uuid().nullable(),
    motivo: z.string().nullable(),
  })
  .refine((a) => a.fim >= a.inicio, { message: "O fim não pode ser antes do início", path: ["fim"] })
  .refine((a) => a.substituto_id === null || a.substituto_id !== a.usuario_id, { message: "O substituto precisa ser outra pessoa", path: ["substituto_id"] });

function ler(fd: FormData, usuarioPadrao: string) {
  return esquema.safeParse({
    usuario_id: t(fd, "usuario_id") || usuarioPadrao,
    inicio: t(fd, "inicio"),
    fim: t(fd, "fim"),
    tipo: t(fd, "tipo") || "ferias",
    substituto_id: t(fd, "substituto_id") || null,
    motivo: t(fd, "motivo") || null,
  });
}

/** Própria: qualquer papel. De outros: sócio e administrativo (a policy ausencias_acesso garante). */
export async function criarAusencia(fd: FormData) {
  const sessao = await exigirSessao();
  const lido = ler(fd, sessao.usuarioId);
  if (!lido.success) falhar(lido.error.issues[0]?.message ?? "Dados inválidos");
  if (lido.data.usuario_id !== sessao.usuarioId && !["socio", "administrativo"].includes(sessao.papel)) falhar("Você só pode cadastrar a própria ausência.");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("ausencias").insert({ escritorio_id: sessao.escritorioId, ...lido.data, criado_por: sessao.usuarioId });
  if (error) falhar(`Não foi possível gravar: ${error.message}`);
  revalidatePath(DESTINO);
  concluir("Ausência cadastrada.");
}

export async function editarAusencia(ausenciaId: string, fd: FormData) {
  const sessao = await exigirSessao();
  const lido = ler(fd, sessao.usuarioId);
  if (!lido.success) falhar(lido.error.issues[0]?.message ?? "Dados inválidos");
  if (lido.data.usuario_id !== sessao.usuarioId && !["socio", "administrativo"].includes(sessao.papel)) falhar("Você só pode editar a própria ausência.");
  const supabase = await criarClienteServidor();
  const { error, count } = await supabase.from("ausencias").update(lido.data, { count: "exact" }).eq("id", ausenciaId).eq("escritorio_id", sessao.escritorioId);
  if (error) falhar(`Não foi possível salvar: ${error.message}`);
  if (count === 0) falhar("Ausência não encontrada ou sem permissão.");
  revalidatePath(DESTINO);
  concluir("Ausência atualizada.");
}

export async function excluirAusencia(ausenciaId: string) {
  const sessao = await exigirSessao();
  const supabase = await criarClienteServidor();
  const { error, count } = await supabase.from("ausencias").delete({ count: "exact" }).eq("id", ausenciaId).eq("escritorio_id", sessao.escritorioId);
  if (error) falhar(`Não foi possível excluir: ${error.message}`);
  if (count === 0) falhar("Ausência não encontrada ou sem permissão.");
  revalidatePath(DESTINO);
  concluir("Ausência excluída.");
}
