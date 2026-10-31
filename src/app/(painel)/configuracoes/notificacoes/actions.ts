"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

const DESTINO = "/configuracoes/notificacoes";

// Mesmos eventos que a tela lista (REGRAS menos os sem emissor), para o override poder ser gravado em todos eles.
const EVENTOS = ["nova_publicacao", "publicacao_sem_processo", "publicacao_sem_tratamento_24h", "publicacao_sem_tratamento_48h", "prazo_d3", "prazo_d1", "prazo_d0", "prazo_vencido", "parcela_vencida", "audiencia_d1", "ia_teto_proximo", "cliente_pediu_contato", "tarefa_atrasada", "resumo_do_dia", "captacao_falhou"] as const;
const CANAIS = ["painel", "whatsapp", "email"] as const;

/** Liga ou desliga um canal para um evento: grava o override em regras_notificacao (UNIQUE escritorio_id, evento, canal). */
export async function alternarCanal(fd: FormData) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") redirect(`${DESTINO}?erro=${encodeURIComponent("Só o sócio altera as notificações.")}`);
  const lido = z.object({ evento: z.enum(EVENTOS), canal: z.enum(CANAIS), ativo: z.boolean() }).safeParse({ evento: fd.get("evento"), canal: fd.get("canal"), ativo: fd.get("ativo") === "1" });
  if (!lido.success) redirect(`${DESTINO}?erro=${encodeURIComponent("Evento ou canal inválido.")}`);
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("regras_notificacao").upsert({ escritorio_id: sessao.escritorioId, evento: lido.data.evento, canal: lido.data.canal, ativo: lido.data.ativo }, { onConflict: "escritorio_id,evento,canal" });
  if (error) redirect(`${DESTINO}?erro=${encodeURIComponent(`Não foi possível salvar: ${error.message}`)}`);
  revalidatePath(DESTINO);
  redirect(`${DESTINO}?ok=${encodeURIComponent(`${lido.data.canal} ${lido.data.ativo ? "ativado" : "desativado"} para ${lido.data.evento}.`)}`);
}

/** Remove o override: volta à regra padrão do sistema. */
export async function restaurarPadrao(fd: FormData) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") redirect(`${DESTINO}?erro=${encodeURIComponent("Só o sócio altera as notificações.")}`);
  const lido = z.object({ evento: z.enum(EVENTOS), canal: z.enum(CANAIS) }).safeParse({ evento: fd.get("evento"), canal: fd.get("canal") });
  if (!lido.success) redirect(`${DESTINO}?erro=${encodeURIComponent("Evento ou canal inválido.")}`);
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("regras_notificacao").delete().eq("escritorio_id", sessao.escritorioId).eq("evento", lido.data.evento).eq("canal", lido.data.canal);
  if (error) redirect(`${DESTINO}?erro=${encodeURIComponent(`Não foi possível restaurar: ${error.message}`)}`);
  revalidatePath(DESTINO);
  redirect(`${DESTINO}?ok=${encodeURIComponent("Regra padrão restaurada.")}`);
}
