"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { extrairDigitosCnj, validarDigitosCnj } from "@/lib/cnj/numero-cnj";
import { mensagemErroBanco } from "@/server/publicacoes";

const Id = z.uuid();

function voltar(id: string, params: { erro?: string; ok?: string }): never {
  const q = new URLSearchParams();
  if (params.erro) q.set("erro", params.erro);
  if (params.ok) q.set("ok", params.ok);
  redirect(`/publicacoes/${id}?${q.toString()}`);
}

function texto(fd: FormData, campo: string): string {
  const v = fd.get(campo);
  return typeof v === "string" ? v.trim() : "";
}

/** Chama `transicionar_publicacao` com o cliente do usuário (a RPC checa papel, escritório e a tabela de transições). */
async function transicionar(id: string, para: string, dados: Record<string, unknown>, ok: string): Promise<never> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("transicionar_publicacao", { p_id: id, p_para: para, p_dados: dados });
  if (error) voltar(id, { erro: mensagemErroBanco(error) });
  revalidatePath("/publicacoes");
  revalidatePath(`/publicacoes/${id}`);
  revalidatePath("/hoje");
  voltar(id, { ok });
}

/** sem_processo | classificada → vinculada, por select de processo ou número CNJ digitado. */
export async function vincularPublicacao(fd: FormData) {
  const id = Id.safeParse(texto(fd, "id"));
  if (!id.success) redirect("/publicacoes?erro=Publica%C3%A7%C3%A3o%20inv%C3%A1lida");
  let processoId = texto(fd, "processo_id");
  const numero = texto(fd, "numero_cnj");

  if (!processoId && numero) {
    const digitos = extrairDigitosCnj(numero);
    if (!digitos || !validarDigitosCnj(digitos)) voltar(id.data, { erro: "Número CNJ inválido. Confira os 20 dígitos." });
    const supabase = await criarClienteServidor();
    const { data } = await supabase.from("processos").select("id").eq("numero_cnj", digitos).maybeSingle();
    if (!data) voltar(id.data, { erro: "Nenhum processo da carteira com esse número. Use «Cadastrar na carteira»." });
    processoId = data.id as string;
  }
  if (!Id.safeParse(processoId).success) voltar(id.data, { erro: "Escolha um processo ou informe o número CNJ." });
  await transicionar(id.data, "vinculada", { processo_id: processoId, vinculo_tipo: "manual" }, "Publicação vinculada ao processo.");
}

const MOTIVOS_IGNORAR: Record<string, string> = { homonimo: "Homônimo", processo_de_colega: "Processo de colega", outro: "Outro" };

/** sem_processo → ignorada ("não é nosso"), com motivo obrigatório. */
export async function ignorarPublicacao(fd: FormData) {
  const id = Id.safeParse(texto(fd, "id"));
  if (!id.success) redirect("/publicacoes?erro=Publica%C3%A7%C3%A3o%20inv%C3%A1lida");
  const tipo = texto(fd, "motivo_tipo");
  const detalhe = texto(fd, "motivo_texto");
  const rotulo = MOTIVOS_IGNORAR[tipo];
  if (!rotulo) voltar(id.data, { erro: "Escolha o motivo." });
  if (tipo === "outro" && !detalhe) voltar(id.data, { erro: "Descreva o motivo." });
  const motivo = detalhe ? `${rotulo}: ${detalhe}` : rotulo;
  await transicionar(id.data, "ignorada", { motivo }, "Publicação marcada como «não é nosso».");
}

/** vinculada → sem_prazo (decisão humana, motivo opcional). */
export async function marcarSemPrazo(fd: FormData) {
  const id = Id.safeParse(texto(fd, "id"));
  if (!id.success) redirect("/publicacoes?erro=Publica%C3%A7%C3%A3o%20inv%C3%A1lida");
  const motivo = texto(fd, "motivo");
  await transicionar(id.data, "sem_prazo", motivo ? { motivo } : {}, "Publicação marcada como sem prazo.");
}

/** sem_prazo → tratada ("ciente"). */
export async function marcarTratada(fd: FormData) {
  const id = Id.safeParse(texto(fd, "id"));
  if (!id.success) redirect("/publicacoes?erro=Publica%C3%A7%C3%A3o%20inv%C3%A1lida");
  const motivo = texto(fd, "motivo");
  await transicionar(id.data, "tratada", motivo ? { motivo } : {}, "Publicação marcada como tratada.");
}

/** qualquer → duplicada, apontando a publicação anterior. */
export async function marcarDuplicada(fd: FormData) {
  const id = Id.safeParse(texto(fd, "id"));
  if (!id.success) redirect("/publicacoes?erro=Publica%C3%A7%C3%A3o%20inv%C3%A1lida");
  const anterior = Id.safeParse(texto(fd, "publicacao_anterior_id"));
  if (!anterior.success) voltar(id.data, { erro: "Informe a publicação anterior (escolha na lista ou cole o identificador)." });
  if (anterior.data === id.data) voltar(id.data, { erro: "A publicação anterior precisa ser outra publicação." });
  await transicionar(id.data, "duplicada", { publicacao_anterior_id: anterior.data }, "Publicação marcada como duplicada.");
}
