import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { atualizarDivida, ErroCalculo, type ItemCalculo, type RegraCalculo, type SeriesEntrada, type Serie } from "@/lib/calculos/atualizar";
import { parsearSerieSgs } from "@/lib/calculos/bcb";
import type { Sessao } from "./sessao";

/**
 * Cálculos de atualização: o motor é determinístico (src/lib/calculos); o banco guarda a regra, os itens e o
 * resultado; a aprovação passa por aprovacoes (objeto 'calculo').
 */
export class ErroCalculoServidor extends Error {}

export interface RegraBanco {
  codigo: string;
  nome: string;
  descricao: string;
  a_confirmar: boolean;
  parametros: { correcao: RegraCalculo["correcao"]; juros_taxa_mensal?: number | string | null; juros_selic?: boolean; juros_selic_menos_ipca?: boolean };
}

export async function listarRegras(supabase: SupabaseClient): Promise<RegraBanco[]> {
  const { data, error } = await supabase.schema("ref").from("regras_juros").select("codigo, nome, descricao, a_confirmar, parametros").order("codigo");
  if (error) throw new ErroCalculoServidor(error.message);
  return (data ?? []) as unknown as RegraBanco[];
}

/** Converte a regra do banco em regra de cálculo (taxa "informada" exige que a advogada a informe no cálculo). */
export function regraDoBanco(r: RegraBanco, taxaInformada: number | null): RegraCalculo {
  const p = r.parametros;
  const taxa = typeof p.juros_taxa_mensal === "number" ? p.juros_taxa_mensal : p.juros_taxa_mensal === "informada" ? taxaInformada : null;
  if (p.juros_taxa_mensal === "informada" && taxa === null) throw new ErroCalculoServidor("Informe a taxa de juros mensal desta regra contratual.");
  const correcao = p.correcao === "informada" ? "informada" : (p.correcao ?? null);
  return { codigo: r.codigo, correcao, jurosTaxaMensal: taxa, jurosSelic: Boolean(p.juros_selic), jurosSelicMenosIpca: Boolean(p.juros_selic_menos_ipca) };
}

const INDICES = ["inpc", "ipca", "ipca_e", "igpm", "selic"] as const;

export async function carregarSeries(supabase: SupabaseClient): Promise<SeriesEntrada> {
  const { data, error } = await supabase.schema("ref").from("indices_economicos").select("indice, competencia, valor").in("indice", [...INDICES]).limit(20_000);
  if (error) throw new ErroCalculoServidor(error.message);
  const series: Record<string, Serie> = {};
  for (const row of data ?? []) {
    const indice = row.indice as string;
    series[indice] ??= {};
    series[indice][String(row.competencia).slice(0, 7)] = Number(row.valor);
  }
  return series as SeriesEntrada;
}

export interface NovoCalculo {
  titulo: string;
  regraCodigo: string;
  taxaInformada: number | null;
  processoId: string | null;
  dataFinal: string;
  itens: ItemCalculo[];
}

/** Cria e calcula. Substitui itens e resultado a cada recálculo (sem histórico: o histórico é o rascunho anterior). */
export async function criarECalcular(sessao: Sessao, d: NovoCalculo): Promise<string> {
  const supabase = await criarClienteServidor();
  const regras = await listarRegras(supabase);
  const rb = regras.find((r) => r.codigo === d.regraCodigo);
  if (!rb) throw new ErroCalculoServidor("Regra de juros desconhecida.");
  const regra = regraDoBanco(rb, d.taxaInformada);
  const series = await carregarSeries(supabase);
  let resultado;
  try {
    resultado = atualizarDivida(d.itens, regra, series, d.dataFinal);
  } catch (e) {
    throw new ErroCalculoServidor(e instanceof ErroCalculo ? e.message : String(e));
  }
  const { data, error } = await supabase
    .from("calculos")
    .insert({
      escritorio_id: sessao.escritorioId,
      processo_id: d.processoId,
      regra_codigo: d.regraCodigo,
      titulo: d.titulo,
      parametros: { dataFinal: d.dataFinal, taxaInformada: d.taxaInformada, itens: d.itens },
      resultado: { totais: resultado.totais, dataFinal: resultado.dataFinal },
      memoria: resultado.itens.map((i) => ({ descricao: i.descricao, passos: i.passos })),
      criado_por: sessao.usuarioId,
    })
    .select("id")
    .single();
  if (error) throw new ErroCalculoServidor(error.message);
  const linhas = resultado.itens.map((i, k) => ({
    escritorio_id: sessao.escritorioId,
    calculo_id: data.id,
    ordem: k + 1,
    descricao: i.descricao,
    data_inicial: d.itens[k].dataInicial,
    valor_original: i.valorOriginal,
    valor_corrigido: i.valorCorrigido,
    juros: i.juros,
    total: i.total,
  }));
  const { error: erroItens } = await supabase.from("calculo_itens").insert(linhas);
  if (erroItens) throw new ErroCalculoServidor(erroItens.message);
  return data.id as string;
}

export async function enviarCalculoParaAprovacao(id: string): Promise<string> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("calculo_enviar_aprovacao", { p_id: id });
  if (error) throw new ErroCalculoServidor(error.message);
  return data as string;
}

/** Job: baixa as séries do BCB desde 2015 e grava os meses novos (idempotente). */
export async function importarIndices(opcoes: { base: string; desde?: string }) {
  const admin = criarClienteAdmin();
  const codigos: Record<string, number> = { inpc: 188, ipca: 433, ipca_e: 10764, igpm: 189, selic: 4390 };
  const resumo: Record<string, number> = {};
  for (const [indice, codigo] of Object.entries(codigos)) {
    const url = `${opcoes.base.replace(/\/$/, "")}.${codigo}/dados?formato=json&dataInicial=${opcoes.desde ?? "01/01/2015"}`;
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new ErroCalculoServidor(`BCB respondeu ${resp.status} para ${indice}`);
    const linhas = (await resp.json()) as { data: string; valor: string }[];
    const serie = parsearSerieSgs(linhas);
    const registros = Object.entries(serie).map(([competencia, valor]) => ({ indice, competencia: `${competencia}-01`, valor, fonte_url: url }));
    for (let i = 0; i < registros.length; i += 500) {
      const { error } = await admin.schema("ref").from("indices_economicos").upsert(registros.slice(i, i + 500), { onConflict: "indice,competencia" });
      if (error) throw new ErroCalculoServidor(error.message);
    }
    resumo[indice] = registros.length;
  }
  return resumo;
}
