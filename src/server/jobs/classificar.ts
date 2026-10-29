import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classificarPublicacao, criarClienteIa, ErroIa, calcularCustoUsd, type ClienteIa, type PrecoModelo } from "@/lib/ia";
import { envServidor } from "@/lib/config/env";
import { sugerirPrazo } from "../prazos";
import { carregarContexto, enfileirarEvento, type ContextoEscritorio } from "../notificacoes";
import { executarJob, listarEscritoriosAtivos } from "./registro";

/**
 * Classifica publicações em `nova` (lotes pequenos), grava ia_execucoes com custo, transiciona a publicação
 * e, quando gera prazo, cria o prazo sugerido. Respeita o teto mensal de IA do escritório.
 */
export async function classificarPendentes(admin: SupabaseClient, opcoes: { lote?: number; cliente?: ClienteIa; escritorioId?: string } = {}) {
  const env = envServidor();
  const cliente = opcoes.cliente ?? (env.ANTHROPIC_API_KEY ? criarClienteIa({ apiKey: env.ANTHROPIC_API_KEY }) : null);
  const modelo = env.IA_MODELO_TRIAGEM;
  const escritorios = (await listarEscritoriosAtivos(admin)).filter((e) => !opcoes.escritorioId || e.id === opcoes.escritorioId);
  const resumo: Record<string, unknown>[] = [];

  const { data: precos } = await admin.schema("ref").from("ia_precos").select("modelo, input_por_mtok, output_por_mtok, cache_write_por_mtok, cache_read_por_mtok, vigencia_inicio").eq("modelo", modelo).order("vigencia_inicio", { ascending: false }).limit(1);
  const preco = (precos?.[0] as PrecoModelo | undefined) ?? null;

  for (const escritorio of escritorios) {
    const r = await executarJob(
      admin,
      "classificar",
      async () => {
        if (!cliente) return { itens: 0, detalhes: { aviso: "ANTHROPIC_API_KEY ausente; nada classificado" } };

        const teto = await tetoAtingido(admin, escritorio.id, env.IA_TETO_MENSAL_USD);
        if (teto.atingido) return { itens: 0, detalhes: { aviso: `teto mensal de IA atingido (US$ ${teto.gasto.toFixed(2)} de ${env.IA_TETO_MENSAL_USD})` } };

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
        // Contexto de notificação carregado só se alguma publicação ficar sem processo
        let ctx: ContextoEscritorio | null = null;

        for (const pub of pendentes ?? []) {
          try {
            const r = await classificarPublicacao({ texto: String(pub.texto ?? ""), tipoOrigem: pub.tipo_origem, orgao: pub.orgao, classe: pub.classe, dataDisponibilizacao: pub.data_disponibilizacao, advogadosDoEscritorio }, { cliente, modelo });
            const custo = preco ? calcularCustoUsd(r.uso, preco) : 0;
            const { data: exec } = await admin
              .from("ia_execucoes")
              .insert({ escritorio_id: escritorio.id, agente: r.agente, agente_versao: r.agenteVersao, modelo: r.modelo, input_tokens: r.uso.input, output_tokens: r.uso.output, cache_creation_input_tokens: r.uso.cacheWrite, cache_read_input_tokens: r.uso.cacheRead, custo_estimado: custo, latencia_ms: r.latenciaMs, status: "ok", request_id: r.requestId, objeto_tipo: "publicacao", objeto_id: pub.id })
              .select("id")
              .single();
            const execId = (exec?.id as string | undefined) ?? null;

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
            const tipo = e instanceof ErroIa ? e.tipo : "erro";
            erros.push(`${pub.id}: ${e instanceof Error ? e.message : String(e)}`);
            await admin.from("ia_execucoes").insert({ escritorio_id: escritorio.id, agente: "classificador_publicacao", agente_versao: "classificador-publicacao.v0", modelo, input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, custo_estimado: 0, status: tipo, erro: e instanceof Error ? e.message : String(e), objeto_tipo: "publicacao", objeto_id: pub.id });
          }
        }
        return { itens: classificadas, detalhes: { pendentes: pendentes?.length ?? 0, classificadas, prazosSugeridos: prazos, semProcesso, erros } };
      },
      escritorio.id,
    );
    resumo.push({ escritorio: escritorio.nome, ...r });
  }
  return resumo;
}

async function tetoAtingido(admin: SupabaseClient, escritorioId: string, tetoUsd: number): Promise<{ atingido: boolean; gasto: number }> {
  const inicioMes = new Date();
  inicioMes.setUTCDate(1);
  inicioMes.setUTCHours(0, 0, 0, 0);
  const { data } = await admin.from("ia_execucoes").select("custo_estimado").eq("escritorio_id", escritorioId).gte("criado_em", inicioMes.toISOString());
  const gasto = (data ?? []).reduce((s, r) => s + Number(r.custo_estimado ?? 0), 0);
  return { atingido: gasto >= tetoUsd, gasto };
}
