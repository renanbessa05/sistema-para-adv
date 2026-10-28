"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { garantirFasesPadrao } from "@/server/processos";

const DESTINO = "/configuracoes/fases";

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
  nome: z.string().min(2, "Informe o nome da fase"),
  ordem: z.coerce.number().int().min(1, "Ordem começa em 1"),
  cor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor em hexadecimal, ex.: #0ea5e9")
    .nullable(),
  codigos_tpu: z.array(z.number().int().positive()),
  ativa: z.boolean(),
});

function ler(fd: FormData) {
  return esquema.safeParse({
    nome: t(fd, "nome"),
    ordem: t(fd, "ordem") || "1",
    cor: t(fd, "cor") || null,
    codigos_tpu: t(fd, "codigos_tpu")
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map((c) => Number(c)),
    ativa: fd.get("ativa") !== "0",
  });
}

export async function criarFase(fd: FormData) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") falhar("Só o sócio edita as fases.");
  const lido = ler(fd);
  if (!lido.success) falhar(lido.error.issues[0]?.message ?? "Dados inválidos (códigos TPU devem ser números)");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("fases_kanban").insert({ escritorio_id: sessao.escritorioId, ...lido.data });
  if (error) falhar(/unique|duplicate/i.test(error.message) ? "Já existe fase com este nome." : `Não foi possível criar: ${error.message}`);
  revalidatePath(DESTINO);
  revalidatePath("/processos/kanban");
  concluir("Fase criada.");
}

export async function editarFase(faseId: string, fd: FormData) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") falhar("Só o sócio edita as fases.");
  const lido = ler(fd);
  if (!lido.success) falhar(lido.error.issues[0]?.message ?? "Dados inválidos (códigos TPU devem ser números)");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("fases_kanban").update(lido.data).eq("id", faseId).eq("escritorio_id", sessao.escritorioId);
  if (error) falhar(/unique|duplicate/i.test(error.message) ? "Já existe fase com este nome." : `Não foi possível salvar: ${error.message}`);
  revalidatePath(DESTINO);
  revalidatePath("/processos/kanban");
  concluir("Fase atualizada.");
}

export async function excluirFase(faseId: string) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") falhar("Só o sócio edita as fases.");
  const supabase = await criarClienteServidor();
  const { count } = await supabase.from("processos").select("id", { count: "exact", head: true }).eq("fase_id", faseId);
  if (count && count > 0) falhar(`Há ${count} processo(s) nesta fase: mova-os antes ou desative a fase.`);
  const { error } = await supabase.from("fases_kanban").delete().eq("id", faseId).eq("escritorio_id", sessao.escritorioId);
  if (error) falhar(`Não foi possível excluir: ${error.message}`);
  revalidatePath(DESTINO);
  revalidatePath("/processos/kanban");
  concluir("Fase excluída.");
}

export async function criarFasesPadrao() {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") falhar("Só o sócio edita as fases.");
  const supabase = await criarClienteServidor();
  await garantirFasesPadrao(supabase, sessao.escritorioId);
  revalidatePath(DESTINO);
  revalidatePath("/processos/kanban");
  concluir("Fases padrão criadas.");
}
