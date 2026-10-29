import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { delimitarDado, ErroIa, type DocumentoEntrada } from "@/lib/ia";
import { SISTEMA as SISTEMA_VARREDURA } from "@/lib/ia/prompts/varredura.v1";
import { VarreduraSchema, type AreaDireito, type TipoPeca, type Varredura } from "@/lib/ia/schemas/minutas";
import { formatarCnj } from "@/lib/cnj";
import { anexarParaApi, listarDocumentos, type Documento } from "./documentos";
import { executarAgente } from "./ia/executar";
import { criarMinuta } from "./minutas";
import type { Sessao } from "./sessao";

/**
 * Varredura dos autos (skill varredura-de-oportunidades): Passo 0 pelo formulário, Parte I pela IA sobre os
 * documentos do processo, aprovação dos pontos pela advogada, e a peça (Parte II) nasce como minuta com os pontos
 * aprovados no intake.
 */
export class ErroVarredura extends Error {}

export interface Analise {
  id: string;
  processo_id: string | null;
  tipo: string;
  parametros: { polo?: string; objetivo?: string; prazo_termo_inicial?: string | null; prazo_termo_final?: string | null; documento_ids?: string[] };
  conteudo_md: string | null;
  estruturado: Varredura | null;
  status: "gerada" | "aprovada";
  pontos_aprovados: number[];
  minuta_id: string | null;
  criado_em: string;
}

const COLUNAS = "id, processo_id, tipo, parametros, conteudo_md, estruturado, status, pontos_aprovados, minuta_id, criado_em";

export async function listarAnalises(supabase: SupabaseClient, filtro: { processoId?: string; tipo?: string } = {}): Promise<(Analise & { processo_numero: string | null })[]> {
  let q = supabase.from("analises").select(`${COLUNAS}, processos(numero_cnj_mascara)`).order("criado_em", { ascending: false }).limit(100);
  if (filtro.processoId) q = q.eq("processo_id", filtro.processoId);
  if (filtro.tipo) q = q.eq("tipo", filtro.tipo);
  const { data, error } = await q;
  if (error) throw new ErroVarredura(error.message);
  return (data ?? []).map((a) => {
    const rel = (a as unknown as { processos?: { numero_cnj_mascara: string | null } | { numero_cnj_mascara: string | null }[] | null }).processos;
    return { ...(a as unknown as Analise), processo_numero: (Array.isArray(rel) ? rel[0]?.numero_cnj_mascara : rel?.numero_cnj_mascara) ?? null };
  });
}

export async function obterAnalise(supabase: SupabaseClient, id: string): Promise<Analise | null> {
  const { data } = await supabase.from("analises").select(COLUNAS).eq("id", id).maybeSingle();
  return (data as unknown as Analise | null) ?? null;
}

export async function criarVarredura(sessao: Sessao, d: { processoId: string; polo: string; objetivo: string; prazoInicial: string | null; prazoFinal: string | null; documentoIds: string[] }): Promise<string> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("analises")
    .insert({ escritorio_id: sessao.escritorioId, processo_id: d.processoId, tipo: "varredura", parametros: { polo: d.polo, objetivo: d.objetivo, prazo_termo_inicial: d.prazoInicial, prazo_termo_final: d.prazoFinal, documento_ids: d.documentoIds }, criado_por: sessao.usuarioId })
    .select("id")
    .single();
  if (error) throw new ErroVarredura(error.message);
  return data.id as string;
}

export async function gerarVarredura(sessao: Sessao, analiseId: string): Promise<void> {
  const supabase = await criarClienteServidor();
  const admin = criarClienteAdmin();
  const a = await obterAnalise(supabase, analiseId);
  if (!a || a.tipo !== "varredura") throw new ErroVarredura("Varredura não encontrada.");
  const [{ data: processo }, { data: partes }, docsTodos] = await Promise.all([
    supabase.from("processos").select("numero_cnj, classe_nome, orgao_julgador_nome, valor_causa, status").eq("id", a.processo_id as string).maybeSingle(),
    supabase.from("processo_partes").select("nome, polo, eh_cliente").eq("processo_id", a.processo_id as string),
    listarDocumentos(supabase, { processoId: a.processo_id as string, limite: 100 }).catch(() => [] as Documento[]),
  ]);
  const docs = a.parametros.documento_ids?.length ? docsTodos.filter((d) => a.parametros.documento_ids!.includes(d.id)) : docsTodos;
  if (docs.length === 0) throw new ErroVarredura("Anexe os autos (PDF) ao processo antes da varredura.");
  const anexados: DocumentoEntrada[] = [];
  for (const d of docs.slice(0, 6)) {
    try {
      anexados.push(await anexarParaApi(admin, d));
    } catch {
      // segue sem o documento inacessível
    }
  }
  const usuario = [
    `Passo 0 (definido pela advogada): polo representado: ${a.parametros.polo}; objetivo da peça: ${a.parametros.objetivo}; prazo em curso: ${a.parametros.prazo_termo_final ? `de ${a.parametros.prazo_termo_inicial ?? "?"} a ${a.parametros.prazo_termo_final}` : "não informado"}.`,
    `Processo: ${processo?.numero_cnj ? formatarCnj(processo.numero_cnj as string) : "?"} · ${processo?.classe_nome ?? ""} · ${processo?.orgao_julgador_nome ?? ""} · valor da causa ${processo?.valor_causa ?? "?"} · status ${processo?.status ?? "?"}`,
    `Partes: ${(partes ?? []).map((p) => `${p.nome} (${p.polo}${p.eh_cliente ? ", CLIENTE" : ""})`).join("; ") || "não cadastradas"}`,
    `Documentos anexados (${anexados.length} de ${docs.length}): ${docs.map((d, k) => `[${k + 1}] ${d.nome}${d.paginas ? ` (${d.paginas} págs.)` : ""}`).join("; ")}`,
    "",
    delimitarDado("inventario_dos_autos", docs.map((d) => `${d.nome}: ${d.texto_extraido_em ? "texto extraído" : "sem texto extraído"}`).join("\n")),
  ].join("\n");
  let dados: Varredura;
  let execucaoId: string | null;
  try {
    const r = await executarAgente({ admin, escritorioId: sessao.escritorioId, agente: "varredura", objeto: { tipo: "analise", id: analiseId } }, (ia, modelo) =>
      ia.gerarEstruturado({ agente: "varredura", modelo, sistema: SISTEMA_VARREDURA, cacheSistema: true, usuario, documentos: anexados, schema: VarreduraSchema, maxTokens: 16_000, effort: "high" }),
    );
    dados = r.resultado.dados;
    execucaoId = r.execucaoId;
  } catch (e) {
    if (e instanceof ErroIa) throw new ErroVarredura(e.tipo === "cancelado_teto" ? "Teto mensal de IA atingido." : `A IA não conseguiu varrer os autos: ${e.message}`);
    throw e;
  }
  const { error } = await supabase.from("analises").update({ conteudo_md: dados.conteudo_md, estruturado: dados, ia_execucao_id: execucaoId, status: "gerada", pontos_aprovados: [] }).eq("id", analiseId);
  if (error) throw new ErroVarredura(error.message);
}

export async function aprovarPontos(sessao: Sessao, analiseId: string, numeros: number[]): Promise<void> {
  if (!["socio", "advogado"].includes(sessao.papel)) throw new ErroVarredura("Só advogado ou sócio aprova pontos.");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("analises").update({ pontos_aprovados: numeros, status: "aprovada" }).eq("id", analiseId);
  if (error) throw new ErroVarredura(error.message);
}

/** Parte II: a peça nasce como minuta (Modo A, direto à redação) com os pontos aprovados no intake. */
export async function criarMinutaDaVarredura(sessao: Sessao, analiseId: string, d: { tipoPeca: TipoPeca; area: AreaDireito; titulo: string }): Promise<string> {
  const supabase = await criarClienteServidor();
  const a = await obterAnalise(supabase, analiseId);
  if (!a?.estruturado) throw new ErroVarredura("Gere e aprove a varredura antes de redigir.");
  const aprovados = a.estruturado.pontos.filter((p) => a.pontos_aprovados.includes(p.numero));
  const usarRecomendados = aprovados.length ? aprovados : a.estruturado.pontos.filter((p) => p.solidez === "solida" && p.prioridade !== "complementar");
  const pontos = usarRecomendados.map((p) => `[Eixo ${p.eixo}] ${p.titulo}. Fundamento: ${p.fundamento}. Onde: ${p.onde_nos_autos}. Resposta do adversário a antecipar: ${p.resposta_adversario}. Solidez: ${p.solidez}; prioridade: ${p.prioridade}.`);
  const id = await criarMinuta(sessao, {
    processoId: a.processo_id,
    prazoId: null,
    analiseId,
    tipoPeca: d.tipoPeca,
    area: d.area,
    modo: "A",
    titulo: d.titulo,
    relato: `Peça a partir da varredura dos autos. Objetivo: ${a.parametros.objetivo}. Polo: ${a.parametros.polo}. Mapa do processo: estado atual "${a.estruturado.mapa.estado_atual}"; última peça pendente: ${a.estruturado.mapa.ultima_peca_pendente ?? "—"}.`,
    rascunho: null,
    pedidos: null,
    urgencia: a.parametros.prazo_termo_final ? `Prazo até ${a.parametros.prazo_termo_final}` : null,
    peculiaridades: a.estruturado.riscos_ma_fe_ou_preclusao.length ? `Riscos sinalizados: ${a.estruturado.riscos_ma_fe_ou_preclusao.join("; ")}` : null,
    parteContraria: null,
    comarca: null,
    vara: null,
    grau: "primeiro",
    documentoIds: a.parametros.documento_ids ?? [],
    pontosVarredura: pontos,
  });
  await supabase.from("analises").update({ minuta_id: id }).eq("id", analiseId);
  return id;
}
