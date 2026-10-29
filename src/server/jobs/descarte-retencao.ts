import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { acaoDescarte, corteDoDescarte, type TipoDado } from "@/lib/lgpd/retencao";
import { executarJob, listarEscritoriosAtivos } from "./registro";

/**
 * Onde cada tipo de dado vive. `apagavel` só vale para os tipos com descarte automático (ver lib/lgpd/retencao).
 * Os demais são apenas contados: o job nunca apaga processo, aprovação nem auditoria.
 */
const ALVOS: Record<TipoDado, { tabela: string; coluna: string; apenasProcessados?: boolean; statusIn?: string[] }> = {
  mensagens_whatsapp: { tabela: "mensagens", coluna: "criado_em" },
  webhooks_inbox: { tabela: "webhooks_inbox", coluna: "recebido_em", apenasProcessados: true },
  exportacoes_csv: { tabela: "exportacoes", coluna: "gerada_em" },
  processos_encerrados: { tabela: "processos", coluna: "atualizado_em", statusIn: ["arquivado", "baixado"] },
  aprovacoes: { tabela: "aprovacoes", coluna: "decidida_em" },
  auditoria_acessos: { tabela: "auditoria_acessos", coluna: "criado_em" },
};

async function contarCandidatos(admin: SupabaseClient, tipo: TipoDado, escritorioId: string, corte: string): Promise<number> {
  const alvo = ALVOS[tipo];
  let consulta = admin.from(alvo.tabela).select("*", { count: "exact", head: true }).eq("escritorio_id", escritorioId).lt(alvo.coluna, corte);
  if (alvo.apenasProcessados) consulta = consulta.not("processado_em", "is", null);
  if (alvo.statusIn) consulta = consulta.in("status", alvo.statusIn);
  const { count, error } = await consulta;
  if (error) throw new Error(`${tipo}: ${error.message}`);
  return count ?? 0;
}

async function apagarCandidatos(admin: SupabaseClient, tipo: TipoDado, escritorioId: string, corte: string): Promise<number> {
  const alvo = ALVOS[tipo];
  let consulta = admin.from(alvo.tabela).delete({ count: "exact" }).eq("escritorio_id", escritorioId).lt(alvo.coluna, corte);
  if (alvo.apenasProcessados) consulta = consulta.not("processado_em", "is", null);
  const { count, error } = await consulta;
  if (error) throw new Error(`${tipo}: ${error.message}`);
  return count ?? 0;
}

/**
 * Domingo, 05h UTC (01h em Cuiabá). Para cada escritório: lê as políticas, conta os candidatos de cada prazo e só apaga
 * quando a política está ativa, confirmada e o tipo tem descarte automático. Cada apagamento vai para lgpd_auditoria.
 */
export async function descarteRetencao(admin: SupabaseClient, opcoes: { agora?: Date } = {}) {
  const agora = opcoes.agora ?? new Date();
  const resumo = [];
  for (const escritorio of await listarEscritoriosAtivos(admin)) {
    const r = await executarJob(
      admin,
      "descarte-retencao",
      async () => {
        const { data: politicas, error } = await admin
          .from("politicas_retencao")
          .select("tipo_dado, prazo_meses, ativo, confirmado_em")
          .eq("escritorio_id", escritorio.id);
        if (error) throw new Error(error.message);

        let apagados = 0;
        const linhas: Record<string, unknown>[] = [];
        for (const p of politicas ?? []) {
          const tipo = p.tipo_dado as TipoDado;
          const prazoMeses = (p.prazo_meses as number | null) ?? null;
          const acao = acaoDescarte({ tipo, prazoMeses, ativo: Boolean(p.ativo), confirmado: p.confirmado_em !== null });
          if (acao === "nao_agir" || prazoMeses === null) {
            linhas.push({ tipo, acao });
            continue;
          }
          const corte = corteDoDescarte(agora, prazoMeses);
          if (acao === "listar") {
            linhas.push({ tipo, acao, candidatos: await contarCandidatos(admin, tipo, escritorio.id, corte), corte });
            continue;
          }
          const removidos = await apagarCandidatos(admin, tipo, escritorio.id, corte);
          apagados += removidos;
          linhas.push({ tipo, acao, removidos, corte });
          const { error: erroAuditoria } = await admin.from("lgpd_auditoria").insert({
            escritorio_id: escritorio.id,
            usuario_id: null,
            acao: "descarte_executado",
            alvo_tipo: tipo,
            alvo_id: null,
            detalhes: { prazo_meses: prazoMeses, corte, removidos },
          });
          if (erroAuditoria) throw new Error(`auditoria: ${erroAuditoria.message}`);
        }
        return { itens: apagados, detalhes: { politicas: linhas } };
      },
      escritorio.id,
    );
    resumo.push({ escritorio: escritorio.nome, ...r });
  }
  return resumo;
}
