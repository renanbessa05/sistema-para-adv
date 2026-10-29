import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { delimitarDado, ErroIa } from "@/lib/ia";
import { SISTEMA as SISTEMA_REVISOR, VERSAO as VERSAO_REVISOR } from "@/lib/ia/prompts/revisor.v1";
import { RevisaoSchema, type Revisao } from "@/lib/ia/schemas/revisao";
import { validarPeca } from "@/lib/pecas/validar";
import { criticosAbertos, mesclarRevisao, type ItemFinal } from "@/lib/revisao/mesclar";
import { executarAgente } from "./ia/executar";
import type { Sessao } from "./sessao";

/**
 * Revisor de peças: confere um texto (colado, ou versão de minuta) com o checklist formal. A IA lê e julga o que
 * exige leitura; o código confere o que é determinável (validarPeca) e prevalece. Crítico aberto bloqueia o envio
 * para aprovação (ver migration 0033) até ser resolvido com justificativa.
 */
export class ErroRevisao extends Error {}

export interface RevisaoRegistro {
  id: string;
  origem: "versao" | "colada" | "arquivo";
  minuta_versao_id: string | null;
  veredito: string | null;
  itens: ItemFinal[];
  relatorio_md: string | null;
  criticos_abertos: number;
  criado_em: string;
}

export async function obterRevisao(supabase: SupabaseClient, id: string): Promise<RevisaoRegistro | null> {
  const { data } = await supabase.from("minuta_revisoes").select("id, origem, minuta_versao_id, veredito, itens, relatorio_md, criticos_abertos, criado_em").eq("id", id).maybeSingle();
  return (data as unknown as RevisaoRegistro | null) ?? null;
}

export async function revisarTexto(
  sessao: Sessao,
  d: { texto: string; tipoPeca: string; grau: "primeiro" | "segundo"; processoCnj?: string | null; minutaVersaoId?: string | null; origem: "versao" | "colada" | "arquivo"; documentosExistentes?: number[] | null },
): Promise<string> {
  if (d.texto.trim().length < 200) throw new ErroRevisao("O texto é curto demais para revisar (mínimo de 200 caracteres).");
  const supabase = await criarClienteServidor();
  const admin = criarClienteAdmin();
  const validacao = validarPeca(d.texto, {
    numeroCnjProcesso: d.processoCnj ?? null,
    documentosExistentes: d.documentosExistentes ?? null,
    citacoesConfirmadas: [],
    grau: d.grau,
    tipoPeca: d.tipoPeca,
    tempestivo: null,
  });

  let modelo: Revisao;
  let execucaoId: string | null;
  try {
    const r = await executarAgente({ admin, escritorioId: sessao.escritorioId, agente: "revisor", agenteVersao: VERSAO_REVISOR, objeto: d.minutaVersaoId ? { tipo: "minuta_versao", id: d.minutaVersaoId } : undefined }, (ia, m) =>
      ia.gerarEstruturado({
        agente: "revisor",
        modelo: m,
        sistema: SISTEMA_REVISOR,
        cacheSistema: true,
        usuario: `Tipo de peça: ${d.tipoPeca} · grau: ${d.grau === "segundo" ? "2º" : "1º"}\n\n${delimitarDado("peca", d.texto.slice(0, 120_000))}`,
        schema: RevisaoSchema,
        maxTokens: 12_000,
        effort: "high",
      }),
    );
    modelo = (r.resultado as { dados: Revisao }).dados;
    execucaoId = r.execucaoId;
  } catch (e) {
    if (e instanceof ErroIa) throw new ErroRevisao(e.tipo === "cancelado_teto" ? "Teto mensal de IA atingido." : `O revisor não conseguiu analisar: ${e.message}`);
    throw e;
  }

  const itens = mesclarRevisao(modelo, validacao);
  const criticos = criticosAbertos(itens);
  const { data, error } = await supabase
    .from("minuta_revisoes")
    .insert({
      escritorio_id: sessao.escritorioId,
      minuta_versao_id: d.minutaVersaoId ?? null,
      origem: d.origem,
      ia_execucao_id: execucaoId,
      veredito: modelo.veredito,
      itens,
      relatorio_md: relatorioMarkdown(modelo, itens),
      criticos_abertos: criticos,
      criado_por: sessao.usuarioId,
    })
    .select("id")
    .single();
  if (error) throw new ErroRevisao(error.message);
  return data.id as string;
}

export function relatorioMarkdown(m: Revisao, itens: ItemFinal[]): string {
  const linhas = [
    `**Veredito:** ${m.veredito}`,
    "",
    "## Checklist",
    ...itens.map((i) => `- ${i.situacao.toUpperCase()} · ${i.id}${i.observacao ? ` — ${i.observacao}` : ""}`),
    "",
    "## Síntese",
    m.sintese_md,
    "",
    "## Plano de ação",
    ...m.plano_acao.map((p, k) => `${k + 1}. ${p}`),
  ];
  return linhas.join("\n");
}

/** Resolve um crítico com justificativa (advogado ou sócio; a RPC confere). */
export async function resolverItem(revisaoId: string, item: string, justificativa: string): Promise<void> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("revisao_resolver_item", { p_revisao: revisaoId, p_item: item, p_justificativa: justificativa });
  if (error) throw new ErroRevisao(error.message);
}
