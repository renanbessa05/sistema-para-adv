import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classificarPublicacao, ErroIa, type ClienteIa } from "@/lib/ia";
import { envServidor } from "@/lib/config/env";
import { formatarDataBR, variaveisNovaPublicacao } from "@/lib/whatsapp";
import { sugerirPrazo } from "../prazos";
import { carregarContexto, enfileirarEvento, type ContextoEscritorio } from "../notificacoes";
import { clienteIaDoAmbiente, executarAgente } from "../ia/executar";
import { verificarTeto } from "../ia/teto";
import { executarJob, listarEscritoriosAtivos } from "./registro";

/**
 * Classifica publicações em `nova` (lotes pequenos), transiciona a publicação e, quando gera prazo, cria o prazo
 * sugerido. Toda chamada passa por executarAgente (teto mensal + registro em ia_execucoes).
 */
export async function classificarPendentes(admin: SupabaseClient, opcoes: { lote?: number; cliente?: ClienteIa; escritorioId?: string } = {}) {
  const env = envServidor();
  const cliente = opcoes.cliente ?? clienteIaDoAmbiente();
  const escritorios = (await listarEscritoriosAtivos(admin)).filter((e) => !opcoes.escritorioId || e.id === opcoes.escritorioId);
  const resumo: Record<string, unknown>[] = [];

  for (const escritorio of escritorios) {
    const r = await executarJob(
      admin,
      "classificar",
      async () => {
        if (!cliente) return { itens: 0, detalhes: { aviso: "ANTHROPIC_API_KEY ausente; nada classificado" } };

        const teto = await verificarTeto(admin, escritorio.id);
        if (teto.atingido) return { itens: 0, detalhes: { aviso: `teto mensal de IA atingido (US$ ${teto.gastoUsd.toFixed(2)} de ${teto.tetoUsd.toFixed(2)})` } };

        const { data: pendentes, error } = await admin
          .from("publicacoes")
          .select("id, escritorio_id, processo_id, texto, tipo_origem, orgao, classe, data_disponibilizacao, numero_cnj, tribunal_id")
          .eq("escritorio_id", escritorio.id)
          .eq("status", "nova")
          .eq("cancelada", false)
          .order("data_disponibilizacao", { ascending: true })
          .limit(opcoes.lote ?? 10);
        if (error) throw new Error(error.message);

        const { data: advogados } = await admin.from("escritorio_membros").select("nome_completo, oab_numero, oab_uf").eq("escritorio_id", escritorio.id).eq("ativo", true).not("oab_numero", "is", null);
        const advogadosDoEscritorio = (advogados ?? []).map((a) => ({ nome: a.nome_completo as string, oab: a.oab_numero ? `${a.oab_numero}/${a.oab_uf}` : null }));

        let classificadas = 0;
        let prazos = 0;
        let semProcesso = 0;
        const erros: string[] = [];
        let notificadas = 0;
        // Contexto de notificação carregado só quando alguma publicação gera evento (vinculada ou sem processo)
        let ctx: ContextoEscritorio | null = null;

        for (const pub of pendentes ?? []) {
          try {
            const { resultado: r, execucaoId: execId } = await executarAgente(
              { admin, escritorioId: escritorio.id, agente: "classificador_publicacao", objeto: { tipo: "publicacao", id: pub.id as string }, cliente },
              (ia, modelo) => classificarPublicacao({ texto: String(pub.texto ?? ""), tipoOrigem: pub.tipo_origem, orgao: pub.orgao, classe: pub.classe, dataDisponibilizacao: pub.data_disponibilizacao, advogadosDoEscritorio }, { cliente: ia, modelo }),
            );

            // Vincula pelo número CNJ validado, se a captação não vinculou
            let processoId = pub.processo_id as string | null;
            if (!processoId && r.numeroCnjValidado) {
              const { data: proc } = await admin.from("processos").select("id").eq("escritorio_id", escritorio.id).eq("numero_cnj", r.numeroCnjValidado).maybeSingle();
              processoId = (proc?.id as string | undefined) ?? null;
            }
            const baixaConfianca = r.dados.confianca < 0.7;
            const proximoStatus = processoId ? (r.dados.gera_prazo ? "com_prazo_sugerido" : "sem_prazo") : "sem_processo";

            await admin
              .from("publicacoes")
              .update({
                tipo: r.dados.tipo,
                tipo_classificado_por: "ia",
                resumo_ia: r.dados.resumo_simples,
                sugere_sigilo: r.dados.sugere_sigilo,
                classificacao: r.dados,
                confianca_ia: r.dados.confianca,
                numero_cnj: pub.numero_cnj ?? r.numeroCnjValidado,
                processo_id: processoId,
                vinculo_tipo: processoId && !pub.processo_id ? "automatico_numero" : undefined,
                ia_execucao_id: execId,
                status: proximoStatus,
                revisar_classificacao: baixaConfianca,
              })
              .eq("id", pub.id);
            await admin.from("publicacao_eventos").insert({ escritorio_id: escritorio.id, publicacao_id: pub.id, de_status: "nova", para_status: proximoStatus, dados: { ia_execucao_id: execId, confianca: r.dados.confianca } });

            if (processoId && r.dados.gera_prazo) {
              const sugerido = await sugerirPrazo(admin, { id: pub.id, escritorio_id: escritorio.id, processo_id: processoId, data_disponibilizacao: pub.data_disponibilizacao, ia_execucao_id: execId }, r.dados);
              if (sugerido) prazos += 1;
            }
            if (processoId) {
              // Publicação vinculada a processo da carteira: avisa o responsável (painel + WhatsApp, regra nova_publicacao).
              // A chave_dedup (evento + publicação + destinatário + canal + dia) impede repetição se o job rodar de novo.
              try {
                ctx ??= await carregarContexto(admin, escritorio.id);
                notificadas += await notificarNovaPublicacao(admin, ctx, env.APP_URL, { id: pub.id as string, processoId, tipoOrigem: pub.tipo_origem as string | null, dataDisponibilizacao: pub.data_disponibilizacao as string | null, resumo: r.dados.resumo_simples, sugereSigilo: Boolean(r.dados.sugere_sigilo) });
              } catch (e) {
                // A publicação já foi classificada; falha só na notificação não vira erro de IA.
                erros.push(`${pub.id}: notificação nova_publicacao: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
            if (proximoStatus === "sem_processo") {
              // Sócios e administrativo decidem: cadastrar o processo, vincular manualmente ou ignorar (homônimo). Nunca o texto da publicação.
              semProcesso += 1;
              try {
                ctx ??= await carregarContexto(admin, escritorio.id);
                const numero = (pub.numero_cnj as string | null) ?? r.numeroCnjValidado ?? "sem número";
                const texto = `📭 Publicação sem processo na carteira: ${numero} (${r.dados.tipo}). Cadastre o processo ou trate a publicação: ${env.APP_URL}/publicacoes/${pub.id}`;
                await enfileirarEvento(admin, ctx, {
                  evento: "publicacao_sem_processo",
                  objeto: { tipo: "publicacao", id: pub.id as string },
                  variaveis: { numero_processo: numero, tipo: String(r.dados.tipo), gera_prazo: r.dados.gera_prazo ? "sim" : "não", link: `${env.APP_URL}/publicacoes/${pub.id}`, texto, assunto: `Publicação sem processo na carteira: ${numero}`, html: `<p>${texto}</p>` },
                });
              } catch (e) {
                // A publicação já foi classificada; falha só na notificação não vira erro de IA.
                erros.push(`${pub.id}: notificação publicacao_sem_processo: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
            classificadas += 1;
          } catch (e) {
            erros.push(`${pub.id}: ${e instanceof Error ? e.message : String(e)}`);
            // Teto atingido no meio do lote: para aqui; o restante fica em `nova` para a próxima rodada.
            if (e instanceof ErroIa && e.tipo === "cancelado_teto") break;
          }
        }
        return { itens: classificadas, detalhes: { pendentes: pendentes?.length ?? 0, classificadas, prazosSugeridos: prazos, semProcesso, notificadas, erros } };
      },
      escritorio.id,
    );
    resumo.push({ escritorio: escritorio.nome, ...r });
  }
  return resumo;
}

interface PublicacaoVinculada {
  id: string;
  processoId: string;
  tipoOrigem: string | null;
  dataDisponibilizacao: string | null;
  resumo: string | null | undefined;
  sugereSigilo: boolean;
}

/**
 * Enfileira `nova_publicacao` para o responsável do processo (sem responsável, a regra manda aos sócios).
 * Processo em segredo de justiça, ou publicação que a IA sugere sigilo, sai só com número e tipo de evento: nunca o resumo.
 * Devolve quantas notificações entraram na fila.
 */
export async function notificarNovaPublicacao(admin: SupabaseClient, ctx: ContextoEscritorio, appUrl: string, pub: PublicacaoVinculada): Promise<number> {
  const { data: proc, error } = await admin.from("processos").select("responsavel_id, numero_cnj_mascara, segredo_justica").eq("id", pub.processoId).maybeSingle();
  if (error) throw new Error(error.message);
  const mascara = (proc?.numero_cnj_mascara as string | null) ?? "sem número";
  const sigiloso = Boolean(proc?.segredo_justica) || pub.sugereSigilo;
  const origem = pub.dataDisponibilizacao ? `${pub.tipoOrigem ?? "DJEN"} de ${formatarDataBR(String(pub.dataDisponibilizacao))}` : (pub.tipoOrigem ?? "DJEN");
  const link = `${appUrl}/publicacoes/${pub.id}`;
  const vars = variaveisNovaPublicacao({ processoMascara: mascara, origem, resumo: pub.resumo ?? null, sigiloso, linkPainel: link });
  const resumoCurto = sigiloso ? "" : pub.resumo?.trim() ? ` ${pub.resumo.trim()}` : "";
  const texto = `📄 Nova publicação no processo ${mascara} (${origem}).${resumoCurto} Trate no painel: ${link}`;
  return enfileirarEvento(admin, ctx, {
    evento: "nova_publicacao",
    objeto: { tipo: "publicacao", id: pub.id },
    responsavelId: (proc?.responsavel_id as string | null) ?? undefined,
    variaveis: { ...Object.fromEntries(vars.map((v, i) => [String(i + 1), v])), numero_processo: mascara, link, texto, assunto: `Nova publicação: ${mascara}`, html: `<p>${texto}</p>` },
  });
}
