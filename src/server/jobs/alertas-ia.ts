import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { envServidor } from "@/lib/config/env";
import { deveAlertarTeto, inicioDoMesUtc, mesDeReferencia, percentualAlerta } from "@/lib/ia/monitoramento";
import { verificarTeto } from "../ia/teto";
import { carregarContexto, enfileirarEvento } from "../notificacoes";
import { executarJob, listarEscritoriosAtivos } from "./registro";

/**
 * 12h UTC (08h em Cuiabá), todo dia: se o gasto de IA do mês chegou a `ia.alerta_percentual` do teto (padrão 80%),
 * enfileira `ia_teto_proximo` para os sócios. Uma vez por escritório e por mês: antes de avisar, procura o aviso do
 * mês em `notificacoes`. Não bloqueia nada; o bloqueio a 100% é do teto (src/server/ia/teto.ts).
 */
export async function alertarIa(admin: SupabaseClient, opcoes: { agora?: Date } = {}) {
  const agora = opcoes.agora ?? new Date();
  const resumo: Record<string, unknown>[] = [];
  for (const escritorio of await listarEscritoriosAtivos(admin)) {
    const r = await executarJob(
      admin,
      "alertas-ia",
      async () => {
        const { data: config } = await admin
          .from("escritorio_configuracoes")
          .select("valor")
          .eq("escritorio_id", escritorio.id)
          .eq("chave", "ia.alerta_percentual")
          .maybeSingle();
        const percentual = percentualAlerta(config?.valor);
        const teto = await verificarTeto(admin, escritorio.id);
        if (!deveAlertarTeto(teto.gastoUsd, teto.tetoUsd, percentual)) {
          return { itens: 0, detalhes: { alertar: false, gastoUsd: teto.gastoUsd, tetoUsd: teto.tetoUsd, percentual } };
        }
        const { data: jaAvisado } = await admin
          .from("notificacoes")
          .select("id")
          .eq("escritorio_id", escritorio.id)
          .eq("evento", "ia_teto_proximo")
          .gte("criado_em", inicioDoMesUtc(agora))
          .limit(1);
        if (jaAvisado?.length) return { itens: 0, detalhes: { alertar: true, jaAvisadoNoMes: true } };

        const ctx = await carregarContexto(admin, escritorio.id);
        const mes = mesDeReferencia(agora);
        const link = `${envServidor().APP_URL}/admin/ia`;
        const gasto = teto.gastoUsd.toFixed(2);
        const limite = teto.tetoUsd.toFixed(2);
        const texto = `Gasto de IA em ${mes} chegou a US$ ${gasto} de US$ ${limite} (${percentual}% do teto). Veja o custo por agente em ${link}.`;
        const n = await enfileirarEvento(admin, ctx, {
          evento: "ia_teto_proximo",
          objeto: { tipo: "ia_teto", id: escritorio.id },
          agora,
          variaveis: { "1": mes, "2": gasto, "3": limite, "4": link, texto, assunto: `Gasto de IA em ${mes} perto do teto`, html: `<p>${texto}</p>` },
        });
        return { itens: n, detalhes: { alertar: true, jaAvisadoNoMes: false, gastoUsd: teto.gastoUsd, tetoUsd: teto.tetoUsd, percentual } };
      },
      escritorio.id,
    );
    resumo.push({ escritorio: escritorio.nome, ...r });
  }
  return resumo;
}
