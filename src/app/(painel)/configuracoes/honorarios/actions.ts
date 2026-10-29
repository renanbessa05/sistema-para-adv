"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/server/sessao";
import { cadastrarTabela, ErroContrato, salvarFatores } from "@/server/contratos";

function num(fd: FormData, nome: string): number {
  return Number(String(fd.get(nome) ?? "").replace(/\./g, "").replace(",", "."));
}

export async function salvarFatoresAction(fd: FormData) {
  const sessao = await exigirSessao();
  const fatores = { baixa: num(fd, "baixa"), media: num(fd, "media"), alta: num(fd, "alta") };
  if (![fatores.baixa, fatores.media, fatores.alta].every((f) => Number.isFinite(f) && f >= 0.5 && f <= 5)) redirect(`/configuracoes/honorarios?erro=${encodeURIComponent("Fatores entre 0,5 e 5.")}`);
  try {
    await salvarFatores(sessao, fatores);
  } catch (e) {
    redirect(`/configuracoes/honorarios?erro=${encodeURIComponent(e instanceof ErroContrato ? e.message : String(e))}`);
  }
  revalidatePath("/configuracoes/honorarios");
  redirect(`/configuracoes/honorarios?ok=${encodeURIComponent("Fatores salvos.")}`);
}

export async function cadastrarTabelaAction(fd: FormData) {
  const sessao = await exigirSessao();
  const vigencia = String(fd.get("vigencia_inicio") ?? "");
  const urh = num(fd, "valor_urh");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vigencia) || !Number.isFinite(urh) || urh <= 0) redirect(`/configuracoes/honorarios?erro=${encodeURIComponent("Informe a data de vigência e o valor da URH.")}`);
  try {
    await cadastrarTabela(sessao, { vigenciaInicio: vigencia, valorUrh: urh, fonteUrl: String(fd.get("fonte_url") ?? "").trim() || null });
  } catch (e) {
    redirect(`/configuracoes/honorarios?erro=${encodeURIComponent(e instanceof ErroContrato ? e.message : String(e))}`);
  }
  revalidatePath("/configuracoes/honorarios");
  redirect(`/configuracoes/honorarios?ok=${encodeURIComponent("Tabela cadastrada.")}`);
}
