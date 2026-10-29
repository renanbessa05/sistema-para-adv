import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeNoFuso, formatarBr } from "@/lib/prazos";
import { adicionarDias, instanteLocal } from "@/lib/notificacoes/horas-uteis";
import { horaLocal } from "@/lib/audiencias/datas";
import { envServidor } from "@/lib/config/env";
import { carregarContexto, enfileirarEvento } from "../notificacoes";
import { executarJob, listarEscritoriosAtivos } from "./registro";

/**
 * 11h UTC em dias úteis: audiências do dia seguinte (fuso do escritório) geram o evento `audiencia_d1` para o
 * responsável e os sócios. Idempotente: marca `alerta_enviado_em` e só pega as que ainda não foram avisadas.
 */
export async function alertarAudiencias(admin: SupabaseClient, opcoes: { agora?: Date } = {}) {
  const env = envServidor();
  const escritorios = await listarEscritoriosAtivos(admin);
  const resumo: Record<string, unknown>[] = [];
  for (const escritorio of escritorios) {
    const r = await executarJob(
      admin,
      "alertas-audiencia",
      async () => {
        const tz = escritorio.timezone;
        const amanha = adicionarDias(hojeNoFuso(tz, opcoes.agora), 1);
        const inicio = instanteLocal(amanha, 0, 0, tz);
        const fim = instanteLocal(adicionarDias(amanha, 1), 0, 0, tz);
        const { data: audiencias, error } = await admin
          .from("audiencias")
          .select("id, tipo, data_hora, modalidade, local_ou_link, responsavel_id, processo_id, processos(numero_cnj_mascara)")
          .eq("escritorio_id", escritorio.id)
          .eq("status", "agendada")
          .is("alerta_enviado_em", null)
          .gte("data_hora", inicio.toISOString())
          .lt("data_hora", fim.toISOString())
          .limit(200);
        if (error) throw new Error(error.message);
        if (!audiencias?.length) return { itens: 0 };
        const ctx = await carregarContexto(admin, escritorio.id);
        let notificadas = 0;
        for (const a of audiencias) {
          const instante = new Date(String(a.data_hora));
          const processo = ((a.processos as { numero_cnj_mascara?: string } | null)?.numero_cnj_mascara as string | undefined) ?? "sem número";
          const hora = horaLocal(instante, tz);
          const link = `${env.APP_URL}/audiencias`;
          const texto = `⚖️ Audiência de ${a.tipo} amanhã, ${formatarBr(amanha)} às ${hora}, processo ${processo} (${a.modalidade}). ${a.local_ou_link ?? ""}`.trim();
          await admin.from("audiencias").update({ alerta_enviado_em: new Date().toISOString() }).eq("id", a.id);
          try {
            await enfileirarEvento(admin, ctx, {
              evento: "audiencia_d1",
              objeto: { tipo: "audiencia", id: a.id as string },
              responsavelId: (a.responsavel_id as string | null) ?? undefined,
              agora: opcoes.agora,
              variaveis: { numero_processo: processo, tipo: String(a.tipo), data: formatarBr(amanha), link, texto, assunto: `Audiência amanhã: ${processo}`, html: `<p>${texto}</p>` },
            });
            notificadas += 1;
          } catch {
            // a audiência já foi marcada como avisada; falha de notificação não derruba o job
          }
        }
        return { itens: audiencias.length, detalhes: { notificadas } };
      },
      escritorio.id,
    );
    resumo.push({ escritorio: escritorio.nome, ...r });
  }
  return resumo;
}
