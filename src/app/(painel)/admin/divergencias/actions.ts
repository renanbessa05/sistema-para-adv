"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { mensagemErroBanco } from "@/server/publicacoes";
import { registrarDivergencia, resolverDivergencia, sextaDeReferencia, TIPOS_DIVERGENCIA } from "@/server/divergencias";

const DESTINO = "/admin/divergencias";

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

const Uuid = z.uuid();
const esquema = z.object({
  semana: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Semana inválida (use o seletor de data)"),
  tipo: z.enum(TIPOS_DIVERGENCIA, "Escolha o tipo da divergência"),
  descricao: z.string().min(3, "Descreva o que divergiu"),
  causa: z.string().nullable(),
  correcao: z.string().nullable(),
  prazo_id: Uuid.nullable(),
  publicacao_id: Uuid.nullable(),
  processo_id: Uuid.nullable(),
});

/** Sócio, advogado e administrativo registram; a RLS (divergencias_insert_papel) nega estagiário mesmo que chegue aqui. */
export async function registrar(fd: FormData) {
  const sessao = await exigirSessao();
  if (sessao.papel === "estagiario") falhar("Estagiário não registra divergência; peça ao administrativo ou ao advogado.");
  const lido = esquema.safeParse({
    semana: t(fd, "semana"),
    tipo: t(fd, "tipo"),
    descricao: t(fd, "descricao"),
    causa: t(fd, "causa") || null,
    correcao: t(fd, "correcao") || null,
    prazo_id: t(fd, "prazo_id") || null,
    publicacao_id: t(fd, "publicacao_id") || null,
    processo_id: t(fd, "processo_id") || null,
  });
  if (!lido.success) falhar(lido.error.issues[0]?.message ?? "Dados inválidos");
  const supabase = await criarClienteServidor();
  // A conferência é semanal: qualquer dia escolhido vira a sexta-feira de referência daquela semana
  const r = await registrarDivergencia(supabase, {
    escritorioId: sessao.escritorioId,
    semana: sextaDeReferencia(lido.data.semana),
    tipo: lido.data.tipo,
    descricao: lido.data.descricao,
    causa: lido.data.causa,
    correcao: lido.data.correcao,
    prazoId: lido.data.prazo_id,
    publicacaoId: lido.data.publicacao_id,
    processoId: lido.data.processo_id,
    registradaPor: sessao.usuarioId,
  });
  if (!r.ok) falhar(mensagemErroBanco({ message: r.erro }, "Não foi possível registrar a divergência."));
  revalidatePath(DESTINO);
  concluir(lido.data.causa ? "Divergência registrada." : "Divergência registrada sem causa: ela conta como não explicada até você preencher a causa ao resolver.");
}

/** Marca como resolvida, aceitando causa e correção no mesmo passo. */
export async function resolver(id: string, fd: FormData) {
  const sessao = await exigirSessao();
  if (sessao.papel === "estagiario") falhar("Estagiário não resolve divergência.");
  if (!Uuid.safeParse(id).success) falhar("Divergência inválida.");
  const supabase = await criarClienteServidor();
  const r = await resolverDivergencia(supabase, id, { causa: t(fd, "causa") || null, correcao: t(fd, "correcao") || null });
  if (!r.ok) falhar(mensagemErroBanco({ message: r.erro }, "Não foi possível resolver a divergência."));
  revalidatePath(DESTINO);
  concluir("Divergência resolvida.");
}
