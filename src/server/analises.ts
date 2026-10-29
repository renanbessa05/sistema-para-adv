import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { delimitarDado, ErroIa, type DocumentoEntrada } from "@/lib/ia";
import { SISTEMA, VERSAO } from "@/lib/ia/prompts/julgador.v1";
import { JulgadorSchema, type Julgador } from "@/lib/ia/schemas/julgador";
import { montarRelatorioJulgador } from "@/lib/analises/julgador";
import { identificarTribunal } from "@/lib/tribunais/codigos";
import { anexarParaApi, listarDocumentos, type Documento } from "./documentos";
import { executarAgente } from "./ia/executar";
import type { Sessao } from "./sessao";

/**
 * Análises do lote 9 gravadas em `analises`. Aqui: o mapa do julgador (tipo mapa_julgador), restrito ao TJ-MT porque a
 * skill tjmt-skill-cl é de Mato Grosso. Outros tribunais estaduais têm o agente próprio (src/server/outros-tribunais.ts).
 * O julgador é neutro: não recebe polo nem objetivo, só um foco opcional da advogada, tratado como dado.
 */
export class ErroAnalise extends Error {}

export interface ParametrosJulgador {
  foco: string | null;
}

export async function gerarMapaJulgador(sessao: Sessao, processoId: string, p: ParametrosJulgador): Promise<string> {
  const supabase = await criarClienteServidor();
  const admin = criarClienteAdmin();
  if (!["socio", "advogado"].includes(sessao.papel)) throw new ErroAnalise("Só advogado ou sócio gera esta análise.");

  const { data: processo, error: erroProc } = await supabase.from("processos").select("numero_cnj, classe_nome, orgao_julgador_nome, valor_causa, status").eq("id", processoId).maybeSingle();
  if (erroProc || !processo) throw new ErroAnalise("Processo não encontrado.");
  const tribunal = identificarTribunal(String(processo.numero_cnj));
  if (!tribunal.mato_grosso) throw new ErroAnalise("O mapa do julgador é da skill do TJ-MT. Para outros tribunais, use a análise de outros tribunais.");

  const [partesRes, docsTodos] = await Promise.all([
    supabase.from("processo_partes").select("nome, polo, eh_cliente").eq("processo_id", processoId),
    listarDocumentos(supabase, { processoId, limite: 100 }).catch(() => [] as Documento[]),
  ]);
  const docs = docsTodos.slice(0, 50);
  if (docs.length === 0) throw new ErroAnalise("Anexe os autos (PDF) ao processo antes da análise.");

  const { data: analise, error: erroAnalise } = await supabase
    .from("analises")
    .insert({
      escritorio_id: sessao.escritorioId,
      processo_id: processoId,
      tipo: "mapa_julgador",
      parametros: { foco: p.foco, tribunal: "TJMT", modo: "B" },
      status: "gerada",
      criado_por: sessao.usuarioId,
    })
    .select("id")
    .single();
  if (erroAnalise) throw new ErroAnalise(erroAnalise.message);
  const analiseId = analise.id as string;

  const anexados: DocumentoEntrada[] = [];
  for (const d of docs.slice(0, 6)) {
    try {
      anexados.push(await anexarParaApi(admin, d));
    } catch {
      // segue sem o documento inacessível; a lacuna aparece no mapa
    }
  }
  const partes = (partesRes.data ?? []).map((x) => `${x.nome} (${x.polo}${x.eh_cliente ? ", cliente do escritório" : ""})`).join("; ") || "não cadastradas";
  const usuario = [
    `Processo: ${processo.numero_cnj} · ${processo.classe_nome ?? ""} · ${processo.orgao_julgador_nome ?? ""} · valor da causa ${processo.valor_causa ?? "?"} · status ${processo.status ?? "?"}.`,
    `Partes cadastradas: ${partes}.`,
    `Documentos anexados (${anexados.length} de ${docs.length}): ${docs.map((d, k) => `[${k + 1}] ${d.nome}${d.paginas ? ` (${d.paginas} págs.)` : ""}`).join("; ")}.`,
    p.foco ? delimitarDado("foco_informado_pela_advogada", p.foco) : "Sem foco informado: faça a análise completa.",
  ].join("\n");

  let dados: Julgador;
  let execucaoId: string | null;
  try {
    const r = await executarAgente({ admin, escritorioId: sessao.escritorioId, agente: "julgador", agenteVersao: VERSAO, objeto: { tipo: "analise", id: analiseId } }, (ia, modelo) =>
      ia.gerarEstruturado({ agente: "julgador", modelo, sistema: SISTEMA, cacheSistema: true, usuario, documentos: anexados, schema: JulgadorSchema, maxTokens: 16_000, effort: "high" }),
    );
    dados = r.resultado.dados;
    execucaoId = r.execucaoId;
  } catch (e) {
    if (e instanceof ErroIa) throw new ErroAnalise(e.tipo === "cancelado_teto" ? "Teto mensal de IA atingido." : `A IA não conseguiu analisar os autos: ${e.message}`);
    throw e;
  }
  const conteudo = montarRelatorioJulgador({ mapaMd: dados.mapa_md, minutaMd: dados.minuta_md, fase: dados.fase });
  const { error } = await supabase
    .from("analises")
    .update({
      conteudo_md: conteudo,
      estruturado: { fase: dados.fase, justificativa_fase: dados.justificativa_fase, ultima_peca_pendente: dados.ultima_peca_pendente, questoes_decisivas: dados.questoes_decisivas, divergencias: dados.divergencias, lacunas: dados.lacunas },
      ia_execucao_id: execucaoId,
    })
    .eq("id", analiseId);
  if (error) throw new ErroAnalise(error.message);
  return analiseId;
}
