"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TIPO_AGENDAMENTO_PRODUTIVIDADE } from "@/server/relatorios";

const DESTINO = "/configuracoes/relatorios";

/** Liga ou desliga o CSV mensal de produtividade (só sócio). A rotina relatorio-mensal lê este agendamento. */
export async function alternarRelatorioMensal(fd: FormData) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") redirect(`${DESTINO}?erro=${encodeURIComponent("Só o sócio altera os relatórios agendados.")}`);
  const ativo = fd.get("ativo") === "1";
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("relatorios_agendados")
    .upsert({ escritorio_id: sessao.escritorioId, tipo: TIPO_AGENDAMENTO_PRODUTIVIDADE, ativo }, { onConflict: "escritorio_id,tipo" });
  if (error) redirect(`${DESTINO}?erro=${encodeURIComponent(`Não foi possível salvar: ${error.message}`)}`);
  revalidatePath(DESTINO);
  redirect(`${DESTINO}?ok=${encodeURIComponent(ativo ? "Relatório mensal ativado: o CSV é gerado no dia 1, às 07h (Cuiabá)." : "Relatório mensal desativado.")}`);
}
