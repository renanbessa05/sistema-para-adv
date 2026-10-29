import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeNoFuso, formatarBr } from "@/lib/prazos";
import { envServidor } from "@/lib/config/env";
import { carregarContexto, enfileirarEvento } from "../notificacoes";
import { executarJob, listarEscritoriosAtivos } from "./registro";

/**
 * 11h UTC em dias úteis: parcelas pendentes com vencimento passado viram `atrasada` e geram o evento
 * `parcela_vencida` para sócios e administrativo (painel e e-mail). Idempotente: só muda o que ainda está pendente.
 */
export async function cobrarParcelas(admin: SupabaseClient, opcoes: { agora?: Date } = {}) {
  const env = envServidor();
  const escritorios = await listarEscritoriosAtivos(admin);
  const resumo: Record<string, unknown>[] = [];
  for (const escritorio of escritorios) {
    const r = await executarJob(
      admin,
      "cobranca-parcelas",
      async () => {
        const hoje = hojeNoFuso(escritorio.timezone, opcoes.agora);
        const { data: vencidas, error } = await admin.from("contrato_parcelas").select("id, numero, vencimento, valor, contrato_id, contratos(cliente_id, clientes(nome))").eq("escritorio_id", escritorio.id).eq("status", "pendente").lt("vencimento", hoje).limit(200);
        if (error) throw new Error(error.message);
        if (!vencidas?.length) return { itens: 0 };
        const ctx = await carregarContexto(admin, escritorio.id);
        let notificadas = 0;
        for (const p of vencidas) {
          await admin.from("contrato_parcelas").update({ status: "atrasada" }).eq("id", p.id);
          const nomeCliente = ((p.contratos as { clientes?: { nome?: string } | null } | null)?.clientes?.nome as string | undefined) ?? "cliente";
          const link = `${env.APP_URL}/contratos/${p.contrato_id}`;
          const texto = `💳 Parcela ${p.numero} de ${nomeCliente} venceu em ${formatarBr(String(p.vencimento))} (R$ ${Number(p.valor).toFixed(2)}). ${link}`;
          try {
            await enfileirarEvento(admin, ctx, {
              evento: "parcela_vencida",
              objeto: { tipo: "contrato", id: p.contrato_id as string },
              agora: opcoes.agora,
              variaveis: { numero_processo: nomeCliente, tipo: `parcela ${p.numero}`, data: formatarBr(String(p.vencimento)), link, texto, assunto: `Parcela vencida: ${nomeCliente}`, html: `<p>${texto}</p>` },
            });
            notificadas += 1;
          } catch {
            // a parcela já foi marcada; falha de notificação não derruba o job
          }
        }
        return { itens: vencidas.length, detalhes: { notificadas } };
      },
      escritorio.id,
    );
    resumo.push({ escritorio: escritorio.nome, ...r });
  }
  return resumo;
}
