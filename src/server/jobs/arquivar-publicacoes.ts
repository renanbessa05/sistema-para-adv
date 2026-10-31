import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executarJob, listarEscritoriosAtivos } from "./registro";

/** Estados finais da publicação que, depois de 30 dias, saem da caixa (docs/regras/estados.md). */
export const STATUS_ARQUIVAVEIS = ["tratada", "ignorada", "duplicada"] as const;
export const DIAS_ATE_ARQUIVAR = 30;
/** Máximo por escritório e execução: o que sobrar fica para o dia seguinte. */
export const LOTE_ARQUIVAMENTO = 500;

/** Instante (ISO) antes do qual a publicação tratada já pode ser arquivada. */
export function corteDoArquivamento(agora: Date, dias: number = DIAS_ATE_ARQUIVAR): string {
  return new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000).toISOString();
}

type Candidata = { id: string; status: string; tratada_em: string | null; atualizado_em: string };

/**
 * 05h UTC (01h em Cuiabá), dias úteis. Para cada escritório: publicações em `tratada`, `ignorada` ou `duplicada`
 * há mais de 30 dias (por `tratada_em`; `atualizado_em` quando a transição antiga não gravou `tratada_em`) passam a
 * `arquivada` pela RPC `transicionar_publicacao`, que valida a transição e grava o `publicacao_eventos` como sistema.
 * `sem_prazo` fica de fora: ainda espera o "ciente" de um advogado.
 */
export async function arquivarPublicacoes(admin: SupabaseClient, opcoes: { agora?: Date } = {}) {
  const agora = opcoes.agora ?? new Date();
  const corte = corteDoArquivamento(agora);
  const resumo = [];
  for (const escritorio of await listarEscritoriosAtivos(admin)) {
    const r = await executarJob(
      admin,
      "arquivar-publicacoes",
      async () => {
        const { data, error } = await admin
          .from("publicacoes")
          .select("id, status, tratada_em, atualizado_em")
          .eq("escritorio_id", escritorio.id)
          .in("status", [...STATUS_ARQUIVAVEIS])
          .or(`tratada_em.lt.${corte},and(tratada_em.is.null,atualizado_em.lt.${corte})`)
          .limit(LOTE_ARQUIVAMENTO);
        if (error) throw new Error(error.message);
        const candidatas = (data ?? []) as Candidata[];

        let arquivadas = 0;
        const falhas: { id: string; erro: string }[] = [];
        for (const pub of candidatas) {
          const { error: erroRpc } = await admin.rpc("transicionar_publicacao", {
            p_id: pub.id,
            p_para: "arquivada",
            p_dados: { origem: "rotina", dias: DIAS_ATE_ARQUIVAR, corte, de_status: pub.status },
          });
          if (erroRpc) {
            falhas.push({ id: pub.id, erro: erroRpc.message });
            continue;
          }
          arquivadas += 1;
        }
        if (falhas.length > 0) {
          throw new Error(
            `${falhas.length} de ${candidatas.length} publicações não arquivadas (${arquivadas} arquivadas); primeira: ${falhas[0].id}: ${falhas[0].erro}`,
          );
        }
        return { itens: arquivadas, detalhes: { corte, candidatas: candidatas.length, loteCheio: candidatas.length >= LOTE_ARQUIVAMENTO } };
      },
      escritorio.id,
    );
    resumo.push({ escritorio: escritorio.nome, ...r });
  }
  return resumo;
}
