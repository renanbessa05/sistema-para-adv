import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calcularPrazo, type Contagem, type ResultadoCalculo } from "@/lib/prazos";
import type { ClassificacaoPublicacao } from "@/lib/ia";
import { carregarCalendario } from "./calendario";

export interface AtoPrazo {
  id: string;
  nome: string;
  sinonimos: string[];
  dias: number;
  contagem: Contagem;
  dobro_padrao: boolean;
  dias_seguranca: number;
  fundamento_legal: string | null;
}

/** Escolhe o ato cadastrado que melhor casa com a sugestão do classificador (por nome e sinônimos). */
export function casarAto(sugestao: string | null, atos: AtoPrazo[]): AtoPrazo | null {
  if (!sugestao) return null;
  const s = sugestao.toLowerCase();
  const normalizar = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const alvo = normalizar(s);
  for (const ato of atos) {
    const nomes = [ato.nome, ...(ato.sinonimos ?? [])].map(normalizar);
    if (nomes.some((n) => alvo.includes(n) || n.includes(alvo))) return ato;
  }
  return null;
}

export interface PublicacaoParaPrazo {
  id: string;
  escritorio_id: string;
  processo_id: string | null;
  data_disponibilizacao: string | null;
  ia_execucao_id?: string | null;
}

/**
 * Cria o prazo sugerido a partir da classificação da IA e do motor de prazos.
 * Nada é confirmado aqui: o prazo nasce `sugerido`, com memória de cálculo, para a advogada decidir.
 */
export async function sugerirPrazo(admin: SupabaseClient, publicacao: PublicacaoParaPrazo, classificacao: ClassificacaoPublicacao): Promise<{ prazoId: string; resultado: ResultadoCalculo } | null> {
  if (!classificacao.gera_prazo || !publicacao.data_disponibilizacao) return null;

  const { data: processo } = publicacao.processo_id
    ? await admin.from("processos").select("id, tribunal_id, comarca_id, responsavel_id, competencia").eq("id", publicacao.processo_id).maybeSingle()
    : { data: null };

  const { data: atosBrutos } = await admin.from("atos_prazo").select("id, nome, sinonimos, dias, contagem, dobro_padrao, dias_seguranca, fundamento_legal").eq("escritorio_id", publicacao.escritorio_id).eq("ativo", true);
  const atos = (atosBrutos ?? []) as AtoPrazo[];
  const ato = casarAto(classificacao.ato, atos);

  const { data: escritorio } = await admin.from("escritorios").select("dias_seguranca_padrao").eq("id", publicacao.escritorio_id).single();

  const quantidade = classificacao.dias_sugeridos ?? ato?.dias ?? 5;
  const contagem: Contagem = classificacao.contagem ?? ato?.contagem ?? "dias_uteis";
  const multiplicador = classificacao.dobro || ato?.dobro_padrao ? 2 : 1;
  const diasSeguranca = ato?.dias_seguranca ?? (escritorio?.dias_seguranca_padrao as number | undefined) ?? 2;

  const calendario = await carregarCalendario(admin, {
    tribunalId: (processo?.tribunal_id as string | null) ?? null,
    comarcaId: (processo?.comarca_id as string | null) ?? null,
  });

  const avisosExtras: string[] = [];
  if (processo?.competencia === "juizado_especial") {
    avisosExtras.push("Processo de Juizado Especial: regra de contagem não validada no MVP; confira manualmente");
  }

  const resultado = calcularPrazo({
    origem: "publicacao_djen",
    dataDisponibilizacao: publicacao.data_disponibilizacao,
    ato: { descricao: classificacao.ato ?? ato?.nome ?? "ato", quantidade, contagem, multiplicador, fundamentoDobro: multiplicador === 2 ? (classificacao.dobro ? "sugerido pela classificação" : "padrão do ato") : null },
    calendario,
    diasSeguranca,
  });
  resultado.avisos.push(...avisosExtras);
  const calendarioIncompleto = resultado.calendarioIncompleto || avisosExtras.length > 0;

  const { data, error } = await admin
    .from("prazos")
    .insert({
      escritorio_id: publicacao.escritorio_id,
      processo_id: publicacao.processo_id,
      publicacao_id: publicacao.id,
      origem: "publicacao_djen",
      tipo: "processual",
      contagem: resultado.contagem,
      ato_id: ato?.id ?? null,
      ato_descricao: classificacao.ato ?? ato?.nome ?? "ato a praticar",
      quantidade,
      multiplicador,
      fundamento_dobro: multiplicador === 2 ? (classificacao.dobro ? "classificação: destinatário com prazo em dobro" : "padrão do ato") : null,
      data_disponibilizacao: resultado.dataDisponibilizacao,
      data_publicacao: resultado.dataPublicacao,
      data_inicio_contagem: resultado.dataInicioContagem,
      data_final: resultado.dataFinal,
      data_interna: resultado.dataInterna,
      data_sugerida_ia: resultado.dataFinal,
      memoria_calculo: { memoria: resultado.memoria, avisos: resultado.avisos, diasPulados: resultado.diasPulados, quantidadeEfetiva: resultado.quantidadeEfetiva },
      calendario_incompleto: calendarioIncompleto,
      status: "sugerido",
      responsavel_id: (processo?.responsavel_id as string | null) ?? null,
      ia_execucao_id: publicacao.ia_execucao_id ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao gravar prazo sugerido: ${error.message}`);
  return { prazoId: data.id as string, resultado };
}
