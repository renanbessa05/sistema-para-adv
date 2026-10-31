import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { horasUteisEntre } from "@/lib/notificacoes";
import { formatarDataBR, variaveisAlertaPrazo, variaveisPublicacaoSemTratamento } from "@/lib/whatsapp";
import { adicionarDias, diferencaEmDias, hojeNoFuso } from "@/lib/prazos";
import { envServidor } from "@/lib/config/env";
import { carregarContexto, enfileirarEvento, type ContextoEscritorio } from "../notificacoes";
import { executarJob, listarEscritoriosAtivos } from "./registro";

const STATUS_SEM_TRATAMENTO = ["nova", "classificada", "vinculada", "sem_processo", "com_prazo_sugerido"];

/**
 * D-3, D-1, D0 e vencidos: um alerta por prazo, destinatário e dia (dedup pela chave).
 * No mesmo passo, tarefas abertas com vencimento passado geram `tarefa_atrasada` para o executor (painel, 07:30 local).
 */
export async function alertasDePrazo(admin: SupabaseClient, opcoes: { agora?: Date } = {}) {
  const env = envServidor();
  const resumo = [];
  for (const escritorio of await listarEscritoriosAtivos(admin)) {
    const r = await executarJob(
      admin,
      "alertas-prazo",
      async () => {
        const ctx = await carregarContexto(admin, escritorio.id);
        const hoje = hojeNoFuso(ctx.timezone, opcoes.agora);
        const { data: prazos, error } = await admin
          .from("prazos")
          .select("id, ato_descricao, data_final, status, responsavel_id, processos(numero_cnj_mascara, segredo_justica)")
          .eq("escritorio_id", escritorio.id)
          .in("status", ["confirmado", "prorrogado", "vencido"])
          .lte("data_final", adicionarDias(hoje, 3));
        if (error) throw new Error(error.message);
        let enfileiradas = 0;
        for (const p of prazos ?? []) {
          const dias = diferencaEmDias(hoje, String(p.data_final));
          let evento: "prazo_d3" | "prazo_d1" | "prazo_d0" | null = null;
          if (dias === 3) evento = "prazo_d3";
          else if (dias === 1) evento = "prazo_d1";
          else if (dias <= 0) evento = "prazo_d0";
          if (!evento) continue;
          const proc = p.processos as unknown as { numero_cnj_mascara: string | null; segredo_justica: boolean } | null;
          const mascara = proc?.numero_cnj_mascara ?? "sem processo";
          const vars = variaveisAlertaPrazo({ ato: String(p.ato_descricao), processoMascara: mascara, dataFinal: String(p.data_final), diasRestantes: dias });
          const texto = dias < 0 ? `⚠️ Prazo VENCIDO há ${-dias} dia(s): ${p.ato_descricao} · ${mascara} · data final ${formatarDataBR(String(p.data_final))}. Marque como cumprido ou cancele no painel.` : `⏰ Prazo ${dias === 0 ? "vence HOJE" : dias === 1 ? "vence amanhã" : `vence em ${dias} dias`}: ${p.ato_descricao} · ${mascara} · ${formatarDataBR(String(p.data_final))}. ${env.APP_URL}/prazos/${p.id}`;
          enfileiradas += await enfileirarEvento(admin, ctx, {
            evento,
            objeto: { tipo: "prazo", id: p.id as string },
            responsavelId: (p.responsavel_id as string | null) ?? undefined,
            variaveis: { ...Object.fromEntries(vars.map((v, i) => [String(i + 1), v])), texto, assunto: `Prazo ${dias <= 0 ? "hoje/vencido" : `em ${dias} dia(s)`}: ${p.ato_descricao}`, html: `<p>${texto}</p>` },
            agora: opcoes.agora,
          });
        }
        const tarefas = await alertasDeTarefaAtrasada(admin, ctx, { hoje, appUrl: env.APP_URL, agora: opcoes.agora });
        return { itens: enfileiradas + tarefas.enfileiradas, detalhes: { prazosAvaliados: prazos?.length ?? 0, tarefasAtrasadas: tarefas.avaliadas, hoje } };
      },
      escritorio.id,
    );
    resumo.push({ escritorio: escritorio.nome, ...r });
  }
  return resumo;
}

/**
 * Tarefas abertas com `vencimento < hoje`: evento `tarefa_atrasada` para o executor (sem executor, o responsável da tarefa;
 * sem nenhum, a regra manda aos sócios). A chave_dedup leva o dia local, então cada tarefa avisa uma vez por dia.
 */
export async function alertasDeTarefaAtrasada(admin: SupabaseClient, ctx: ContextoEscritorio, opcoes: { hoje: string; appUrl: string; agora?: Date }): Promise<{ avaliadas: number; enfileiradas: number }> {
  const { data: tarefas, error } = await admin
    .from("tarefas")
    .select("id, titulo, vencimento, executor_id, responsavel_id, processos(numero_cnj_mascara)")
    .eq("escritorio_id", ctx.id)
    .not("status", "in", "(concluida,cancelada)")
    .lt("vencimento", opcoes.hoje);
  if (error) throw new Error(error.message);
  let enfileiradas = 0;
  for (const t of tarefas ?? []) {
    const vencimento = String(t.vencimento);
    const dias = diferencaEmDias(vencimento, opcoes.hoje);
    const mascara = (t.processos as unknown as { numero_cnj_mascara: string | null } | null)?.numero_cnj_mascara;
    const link = `${opcoes.appUrl}/tarefas/${t.id}`;
    const texto = `📌 Tarefa atrasada há ${dias} dia(s): ${t.titulo}${mascara ? ` · ${mascara}` : ""} · vencia em ${formatarDataBR(vencimento)}. ${link}`;
    enfileiradas += await enfileirarEvento(admin, ctx, {
      evento: "tarefa_atrasada",
      objeto: { tipo: "tarefa", id: t.id as string },
      responsavelId: (t.executor_id as string | null) ?? (t.responsavel_id as string | null) ?? undefined,
      variaveis: { titulo: String(t.titulo), numero_processo: mascara ?? "", vencimento, dias_atraso: String(dias), link, texto, assunto: `Tarefa atrasada: ${t.titulo}`, html: `<p>${texto}</p>` },
      agora: opcoes.agora,
    });
  }
  return { avaliadas: tarefas?.length ?? 0, enfileiradas };
}

/** Publicações sem tratamento há 24 h úteis (responsável) e 48 h úteis (sócios). */
export async function alertasDePublicacao(admin: SupabaseClient, opcoes: { agora?: Date } = {}) {
  const env = envServidor();
  const agora = opcoes.agora ?? new Date();
  const resumo = [];
  for (const escritorio of await listarEscritoriosAtivos(admin)) {
    const r = await executarJob(
      admin,
      "alertas-publicacao",
      async () => {
        const ctx = await carregarContexto(admin, escritorio.id);
        const { data: publicacoes, error } = await admin
          .from("publicacoes")
          .select("id, criado_em, processo_id, numero_cnj, processos(numero_cnj_mascara, responsavel_id)")
          .eq("escritorio_id", escritorio.id)
          .in("status", STATUS_SEM_TRATAMENTO)
          .eq("cancelada", false)
          .lte("criado_em", new Date(agora.getTime() - 20 * 3_600_000).toISOString());
        if (error) throw new Error(error.message);
        let enfileiradas = 0;
        for (const pub of publicacoes ?? []) {
          const horas = horasUteisEntre(new Date(String(pub.criado_em)), agora, { tz: ctx.timezone, feriados: ctx.feriados });
          if (horas < 24) continue;
          const proc = pub.processos as unknown as { numero_cnj_mascara: string | null; responsavel_id: string | null } | null;
          const responsavelId = proc?.responsavel_id ?? undefined;
          const responsavelNome = ctx.membros.find((m) => m.id === responsavelId)?.nome ?? "responsável";
          const mascara = proc?.numero_cnj_mascara ?? (pub.numero_cnj ? String(pub.numero_cnj) : "sem processo");
          const vars = variaveisPublicacaoSemTratamento({ processoMascara: mascara, horasUteis: Math.floor(horas), responsavelNome, linkPainel: `${env.APP_URL}/publicacoes/${pub.id}` });
          const texto = `📬 Publicação do processo ${mascara} está há ${Math.floor(horas)} h úteis sem tratamento. ${env.APP_URL}/publicacoes/${pub.id}`;
          const base = { objeto: { tipo: "publicacao", id: pub.id as string }, responsavelId, variaveis: { ...Object.fromEntries(vars.map((v, i) => [String(i + 1), v])), texto, assunto: `Publicação sem tratamento: ${mascara}`, html: `<p>${texto}</p>` }, agora };
          enfileiradas += await enfileirarEvento(admin, ctx, { ...base, evento: horas >= 48 ? "publicacao_sem_tratamento_48h" : "publicacao_sem_tratamento_24h" });
        }
        return { itens: enfileiradas, detalhes: { avaliadas: publicacoes?.length ?? 0 } };
      },
      escritorio.id,
    );
    resumo.push({ escritorio: escritorio.nome, ...r });
  }
  return resumo;
}
