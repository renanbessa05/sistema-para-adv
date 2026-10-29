import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { delimitarDado, ErroIa, type DocumentoEntrada } from "@/lib/ia";
import { SISTEMA, VERSAO } from "@/lib/ia/prompts/outros-tribunais.v1";
import { OutrosTribunaisSchema, type OutrosTribunais } from "@/lib/ia/schemas/outros-tribunais";
import { montarCamadaLocal } from "@/lib/tribunais/camada";
import { identificarTribunal } from "@/lib/tribunais/codigos";
import { anexarParaApi, listarDocumentos, type Documento } from "./documentos";
import { executarAgente } from "./ia/executar";
import type { Sessao } from "./sessao";

/**
 * Análise de processo em tribunal estadual diverso do TJ-MT (lote 9). A camada local é montada aqui, a partir do
 * banco: itens do seed ('*') mais as confirmações do escritório para o tribunal identificado. O resultado vai para
 * `analises` (tipo outros_tribunais), com o Passo 0 (polo, objetivo, prazo) que a advogada informou.
 */
export class ErroOutrosTribunais extends Error {}

export interface ParametrosOutrosTribunais {
  polo: string;
  objetivo: string;
  prazoTermoFinal: string | null;
}

export async function gerarAnaliseOutrosTribunais(sessao: Sessao, processoId: string, p: ParametrosOutrosTribunais): Promise<string> {
  const supabase = await criarClienteServidor();
  const admin = criarClienteAdmin();
  if (!["socio", "advogado"].includes(sessao.papel)) throw new ErroOutrosTribunais("Só advogado ou sócio gera esta análise.");

  const { data: processo, error: erroProc } = await supabase.from("processos").select("numero_cnj, classe_nome, orgao_julgador_nome, valor_causa, status").eq("id", processoId).maybeSingle();
  if (erroProc || !processo) throw new ErroOutrosTribunais("Processo não encontrado.");
  const tribunal = identificarTribunal(String(processo.numero_cnj));
  if (!tribunal.aplicavel || !tribunal.sigla) throw new ErroOutrosTribunais(tribunal.motivo ?? "Tribunal não identificado.");

  const [{ data: seed }, { data: confirmacoes }, partesRes, docsTodos] = await Promise.all([
    supabase.schema("ref").from("tribunal_camada_local").select("bloco, bloco_titulo, item").in("tribunal_sigla", ["*", tribunal.sigla]).order("bloco"),
    supabase.from("escritorio_camada_local").select("bloco, item, fonte").eq("tribunal_sigla", tribunal.sigla),
    supabase.from("processo_partes").select("nome, polo, eh_cliente").eq("processo_id", processoId),
    listarDocumentos(supabase, { processoId, limite: 100 }).catch(() => [] as Documento[]),
  ]);
  const camada = montarCamadaLocal(
    (seed ?? []).map((s) => ({ bloco: Number(s.bloco), bloco_titulo: String(s.bloco_titulo), item: String(s.item) })),
    (confirmacoes ?? []).map((c) => ({ bloco: Number(c.bloco), item: String(c.item), fonte: String(c.fonte) })),
  );
  const docs = docsTodos.slice(0, 50);
  if (docs.length === 0) throw new ErroOutrosTribunais("Anexe os autos (PDF) ao processo antes da análise.");

  const { data: analise, error: erroAnalise } = await supabase
    .from("analises")
    .insert({
      escritorio_id: sessao.escritorioId,
      processo_id: processoId,
      tipo: "outros_tribunais",
      parametros: { polo: p.polo, objetivo: p.objetivo, prazo_termo_final: p.prazoTermoFinal, tribunal: tribunal.sigla },
      status: "gerada",
      criado_por: sessao.usuarioId,
    })
    .select("id")
    .single();
  if (erroAnalise) throw new ErroOutrosTribunais(erroAnalise.message);
  const analiseId = analise.id as string;

  const anexados: DocumentoEntrada[] = [];
  for (const d of docs.slice(0, 6)) {
    try {
      anexados.push(await anexarParaApi(admin, d));
    } catch {
      // segue sem o documento inacessível
    }
  }
  const partes = (partesRes.data ?? []).map((x) => `${x.nome} (${x.polo}${x.eh_cliente ? ", CLIENTE" : ""})`).join("; ") || "não cadastradas";
  const usuario = [
    `Passo 0 (definido pela advogada): polo representado: ${p.polo}; objetivo: ${p.objetivo}; prazo em curso: ${p.prazoTermoFinal ? `até ${p.prazoTermoFinal}` : "não informado"}.`,
    `Tribunal: ${tribunal.sigla} (${tribunal.nome}). Processo: ${processo.numero_cnj} · ${processo.classe_nome ?? ""} · ${processo.orgao_julgador_nome ?? ""} · valor da causa ${processo.valor_causa ?? "?"} · status ${processo.status ?? "?"}.`,
    `Partes cadastradas: ${partes}.`,
    `Documentos anexados (${anexados.length} de ${docs.length}): ${docs.map((d, k) => `[${k + 1}] ${d.nome}${d.paginas ? ` (${d.paginas} págs.)` : ""}`).join("; ")}.`,
    "",
    delimitarDado("camada_local", camada.map((c) => `Bloco ${c.bloco} (${c.bloco_titulo}) · ${c.situacao} · ${c.item}${c.fonte ? ` · fonte: ${c.fonte}` : ""}`).join("\n")),
  ].join("\n");

  let dados: OutrosTribunais;
  let execucaoId: string | null;
  try {
    const r = await executarAgente({ admin, escritorioId: sessao.escritorioId, agente: "outros_tribunais", agenteVersao: VERSAO, objeto: { tipo: "analise", id: analiseId } }, (ia, modelo) =>
      ia.gerarEstruturado({ agente: "outros_tribunais", modelo, sistema: SISTEMA, cacheSistema: true, usuario, documentos: anexados, schema: OutrosTribunaisSchema, maxTokens: 16_000, effort: "high" }),
    );
    dados = r.resultado.dados;
    execucaoId = r.execucaoId;
  } catch (e) {
    if (e instanceof ErroIa) throw new ErroOutrosTribunais(e.tipo === "cancelado_teto" ? "Teto mensal de IA atingido." : `A IA não conseguiu analisar os autos: ${e.message}`);
    throw e;
  }
  const { error } = await supabase.from("analises").update({ conteudo_md: dados.conteudo_md, estruturado: dados, ia_execucao_id: execucaoId }).eq("id", analiseId);
  if (error) throw new ErroOutrosTribunais(error.message);
  return analiseId;
}
