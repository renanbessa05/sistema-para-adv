import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { diferencaEmDias, hojeNoFuso } from "@/lib/prazos";
import { formatarDataBR, variaveisAlertaPrazo } from "@/lib/whatsapp";
import { envServidor } from "@/lib/config/env";
import { carregarContexto, enfileirarEvento } from "@/server/notificacoes";
import { autorizarCron } from "@/server/jobs/protecao";
import { executarJob, listarEscritoriosAtivos } from "@/server/jobs/registro";

type PrazoVencido = { id: string; processo_id: string | null; responsavel_id: string | null };

/**
 * 0h05 de Cuiabá: prazos confirmados ou prorrogados com data final anterior a hoje viram `vencido`
 * (RPC marcar_prazos_vencidos_detalhado(p_hoje, p_escritorio), só service role, um escritório por vez) e cada um
 * gera o evento `prazo_vencido` para o responsável e os sócios (painel, WhatsApp e e-mail, na hora).
 */
export async function GET(request: Request) {
  const negado = autorizarCron(request);
  if (negado) return negado;
  const env = envServidor();
  const admin = criarClienteAdmin();
  const resultado = [];
  for (const escritorio of await listarEscritoriosAtivos(admin)) {
    const r = await executarJob(
      admin,
      "marcar-vencidos",
      async () => {
        const hoje = hojeNoFuso(escritorio.timezone);
        const { data, error } = await admin.rpc("marcar_prazos_vencidos_detalhado", { p_hoje: hoje, p_escritorio: escritorio.id });
        if (error) throw new Error(error.message);
        const marcados = ((data ?? []) as PrazoVencido[]).map((v) => v.id);
        if (marcados.length === 0) return { itens: 0, detalhes: { hoje, notificacoes: 0 } };

        const { data: detalhes, error: erroDetalhes } = await admin
          .from("prazos")
          .select("id, ato_descricao, data_final, responsavel_id, processos(numero_cnj_mascara)")
          .eq("escritorio_id", escritorio.id)
          .in("id", marcados);
        if (erroDetalhes) throw new Error(erroDetalhes.message);
        if (!detalhes || detalhes.length === 0) return { itens: 0, detalhes: { hoje, notificacoes: 0 } };

        const ctx = await carregarContexto(admin, escritorio.id);
        let notificacoes = 0;
        for (const p of detalhes) {
          const mascara = (p.processos as unknown as { numero_cnj_mascara: string | null } | null)?.numero_cnj_mascara ?? "sem processo";
          const dataFinal = String(p.data_final);
          const diasAtraso = Math.max(1, diferencaEmDias(dataFinal, hoje));
          const vars = variaveisAlertaPrazo({ ato: String(p.ato_descricao ?? "Prazo"), processoMascara: mascara, dataFinal, diasRestantes: -diasAtraso });
          const texto = `⚠️ Prazo VENCIDO sem cumprimento: ${p.ato_descricao ?? "prazo"} · ${mascara} · data final ${formatarDataBR(dataFinal)}. Marque como cumprido (se protocolado) ou cancele com motivo: ${env.APP_URL}/prazos/${p.id}`;
          notificacoes += await enfileirarEvento(admin, ctx, {
            evento: "prazo_vencido",
            objeto: { tipo: "prazo", id: p.id as string },
            responsavelId: (p.responsavel_id as string | null) ?? undefined,
            variaveis: { ...Object.fromEntries(vars.map((v, i) => [String(i + 1), v])), texto, assunto: `Prazo vencido: ${p.ato_descricao ?? "prazo"} · ${mascara}`, html: `<p>${texto}</p>`, link: `${env.APP_URL}/prazos/${p.id}` },
          });
        }
        return { itens: detalhes.length, detalhes: { hoje, notificacoes } };
      },
      escritorio.id,
    );
    resultado.push({ escritorio: escritorio.nome, ...r });
  }
  return NextResponse.json({ rotina: "marcar-vencidos", escritorios: resultado });
}
