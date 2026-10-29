"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TRIBUNAIS_ESTADUAIS } from "@/lib/tribunais/codigos";

function t(fd: FormData, n: string): string {
  const v = fd.get(n);
  return typeof v === "string" ? v.trim() : "";
}

/** Confirma um item da camada local para um tribunal, com a fonte oficial. Só sócio confirma. */
export async function confirmarCamadaAction(fd: FormData) {
  const sessao = await exigirSessao();
  let mensagem: string | null = null;
  if (sessao.papel !== "socio") {
    mensagem = "Só o sócio confirma item da camada local.";
  } else {
    const sigla = t(fd, "tribunal_sigla");
    const bloco = Number(t(fd, "bloco"));
    const item = t(fd, "item");
    const fonte = t(fd, "fonte");
    const tribunalValido = Object.values(TRIBUNAIS_ESTADUAIS).some((x) => x.sigla === sigla);
    if (!tribunalValido) mensagem = "Tribunal inválido.";
    else if (!(bloco >= 1 && bloco <= 8)) mensagem = "Bloco deve ser de 1 a 8.";
    else if (item.length < 10) mensagem = "Descreva o item com pelo menos 10 caracteres.";
    else if (fonte.length < 10) mensagem = "Informe a fonte oficial (página, provimento, tabela ou documento dos autos).";
    else {
      const supabase = await criarClienteServidor();
      const { error } = await supabase.from("escritorio_camada_local").insert({
        escritorio_id: sessao.escritorioId,
        tribunal_sigla: sigla,
        bloco,
        item,
        situacao: "confirmado",
        fonte,
        confirmado_por: sessao.usuarioId,
      });
      if (error) mensagem = error.code === "23505" ? "Esse item já está confirmado para o tribunal." : error.message;
    }
  }
  if (mensagem) redirect(`/configuracoes/tribunais?erro=${encodeURIComponent(mensagem)}`);
  revalidatePath("/configuracoes/tribunais");
  redirect(`/configuracoes/tribunais?ok=${encodeURIComponent("Item confirmado com fonte.")}`);
}
