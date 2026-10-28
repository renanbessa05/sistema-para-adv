import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { montarResumoDoDia, type ItemPrazo, type ItemTarefa } from "@/lib/notificacoes";
import { variaveisResumoDoDia } from "@/lib/whatsapp";
import { calcularPeriodos, hojeNoFuso, nomeDiaSemana } from "@/lib/prazos";
import { envServidor } from "@/lib/config/env";
import { carregarCalendario } from "../calendario";
import { carregarContexto, enfileirarEvento } from "../notificacoes";
import { executarJob, listarEscritoriosAtivos } from "./registro";

/** Monta o resumo de cada membro ativo e enfileira (WhatsApp por template, e-mail em HTML, painel). */
export async function resumoDoDia(admin: SupabaseClient, opcoes: { agora?: Date } = {}) {
  const env = envServidor();
  const resumo = [];
  for (const escritorio of await listarEscritoriosAtivos(admin)) {
    const r = await executarJob(
      admin,
      "resumo-do-dia",
      async () => {
        const ctx = await carregarContexto(admin, escritorio.id);
        const calendario = await carregarCalendario(admin, { tribunalId: null, comarcaId: null });
        const periodos = calcularPeriodos(calendario, { timeZone: ctx.timezone, agora: opcoes.agora });
        const hoje = hojeNoFuso(ctx.timezone, opcoes.agora);
        const dataLocal = `${nomeDiaSemana(hoje)}, ${hoje.slice(8, 10)}/${hoje.slice(5, 7)}`;

        const { count: publicacoesNovas } = await admin.from("publicacoes").select("id", { count: "exact", head: true }).eq("escritorio_id", escritorio.id).in("status", ["nova", "classificada", "vinculada", "sem_processo", "com_prazo_sugerido"]);
        const { data: prazos } = await admin.from("prazos").select("id, ato_descricao, data_final, data_interna, responsavel_id, processos(numero_cnj_mascara)").eq("escritorio_id", escritorio.id).in("status", ["confirmado", "prorrogado", "vencido"]).lte("data_final", periodos.semanaFim);
        const { data: tarefas } = await admin.from("tarefas").select("id, titulo, vencimento, executor_id, processos(numero_cnj_mascara)").eq("escritorio_id", escritorio.id).not("status", "in", "(concluida,cancelada)").lt("vencimento", hoje);

        let enfileiradas = 0;
        for (const membro of ctx.membros.filter((m) => m.ativo)) {
          const socio = membro.papel === "socio";
          const meusPrazos = (prazos ?? []).filter((p) => socio || p.responsavel_id === membro.id);
          const item = (p: (typeof meusPrazos)[number]): ItemPrazo => ({ processoMascara: ((p.processos as unknown as { numero_cnj_mascara: string | null } | null)?.numero_cnj_mascara) ?? "sem processo", ato: String(p.ato_descricao), dataFinal: String(p.data_final), dataInterna: (p.data_interna as string | null) ?? undefined });
          const prazosHoje = meusPrazos.filter((p) => String(p.data_final) <= periodos.hoje).map(item);
          const prazosAmanha = meusPrazos.filter((p) => String(p.data_final) === periodos.amanha).map(item);
          const prazosSemana = meusPrazos.filter((p) => String(p.data_final) > periodos.amanha).map(item);
          const tarefasAtrasadas: ItemTarefa[] = (tarefas ?? []).filter((t) => socio || t.executor_id === membro.id).map((t) => ({ titulo: String(t.titulo), processoMascara: ((t.processos as unknown as { numero_cnj_mascara: string | null } | null)?.numero_cnj_mascara) ?? undefined, dataInterna: String(t.vencimento) }));
          if (!socio && prazosHoje.length + prazosAmanha.length + prazosSemana.length + tarefasAtrasadas.length === 0 && !publicacoesNovas) continue;

          const montado = montarResumoDoDia({ nome: membro.nome.split(" ")[0], publicacoesNovas: publicacoesNovas ?? 0, prazosHoje, prazosAmanha, prazosSemana, tarefasAtrasadas, linkPainel: `${env.APP_URL}/hoje`, dataLocal });
          const vars = variaveisResumoDoDia({ nome: membro.nome.split(" ")[0], dataLocal, publicacoesNovas: publicacoesNovas ?? 0, prazosHoje: prazosHoje.length, prazosAmanha: prazosAmanha.length, tarefasAtrasadas: tarefasAtrasadas.length, linkPainel: `${env.APP_URL}/hoje` });
          enfileiradas += await enfileirarEvento(admin, ctx, {
            evento: "resumo_do_dia",
            objeto: { tipo: "resumo", id: `${hoje}` },
            usuarioAlvoId: membro.id,
            variaveis: { ...Object.fromEntries(vars.map((v, i) => [String(i + 1), v])), texto: montado.whatsapp, assunto: montado.emailAssunto, html: montado.emailHtml },
            agora: opcoes.agora,
          });
        }
        return { itens: enfileiradas, detalhes: { hoje } };
      },
      escritorio.id,
    );
    resumo.push({ escritorio: escritorio.nome, ...r });
  }
  return resumo;
}
