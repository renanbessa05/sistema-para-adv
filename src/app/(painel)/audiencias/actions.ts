"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarAudiencia, ErroAudiencia, TIPOS_AUDIENCIA } from "@/server/audiencias";

function t(fd: FormData, n: string): string {
  const v = fd.get(n);
  return typeof v === "string" ? v.trim() : "";
}

export async function novaAudienciaAction(fd: FormData) {
  const sessao = await exigirSessao();
  const supabase = await criarClienteServidor();
  let mensagem: string | null = null;
  try {
    const { data: escritorio } = await supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).single();
    const tipo = t(fd, "tipo");
    if (!(TIPOS_AUDIENCIA as readonly string[]).includes(tipo)) throw new ErroAudiencia("Tipo de audiência inválido.");
    await criarAudiencia(
      supabase,
      sessao,
      {
        processoId: t(fd, "processo_id"),
        tipo: tipo as (typeof TIPOS_AUDIENCIA)[number],
        dataHora: t(fd, "data_hora"),
        modalidade: t(fd, "modalidade") === "virtual" ? "virtual" : "presencial",
        localOuLink: t(fd, "local_ou_link") || null,
        responsavelId: t(fd, "responsavel_id") || null,
        observacoes: t(fd, "observacoes") || null,
      },
      (escritorio?.timezone as string | undefined) ?? "America/Cuiaba",
    );
  } catch (e) {
    mensagem = e instanceof ErroAudiencia ? e.message : "Falha ao agendar audiência.";
  }
  if (mensagem) redirect(`/audiencias/nova?erro=${encodeURIComponent(mensagem)}`);
  revalidatePath("/audiencias");
  redirect(`/audiencias?ok=${encodeURIComponent("Audiência agendada. O alerta sai na véspera.")}`);
}
