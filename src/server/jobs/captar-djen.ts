import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteDjen, hashDedup, normalizarPublicacaoDjen, type PublicacaoNormalizada } from "@/lib/djen";
import { adicionarDias, hojeNoFuso } from "@/lib/prazos";
import { envServidor } from "@/lib/config/env";
import { executarJob, listarEscritoriosAtivos } from "./registro";

export interface OpcoesCaptacao {
  /** Janela em dias para trás (pega atrasos da API). Padrão 3. */
  janelaDias?: number;
  /** Só este escritório (útil em testes e reprocessamentos). */
  escritorioId?: string;
  /** Data "hoje" fixa (testes). */
  hoje?: string;
}

interface MembroComOab {
  id: string;
  usuario_id: string | null;
  nome_completo: string;
  oab_numero: string;
  oab_uf: string;
}

/**
 * Captação diária do DJEN: para cada escritório ativo e cada advogado com OAB, consulta a API por OAB+UF
 * na janela, normaliza, deduplica por (fonte, id_externo) e grava `publicacoes` em `nova`.
 * Vincula ao processo da carteira pelo número CNJ quando houver. Cada rodada vai para `captacoes`.
 */
export async function captarDjen(admin: SupabaseClient, opcoes: OpcoesCaptacao = {}) {
  const env = envServidor();
  const djen = criarClienteDjen({ baseUrl: env.DJEN_BASE_URL });
  const escritorios = (await listarEscritoriosAtivos(admin)).filter((e) => !opcoes.escritorioId || e.id === opcoes.escritorioId);
  const resumo: Record<string, unknown>[] = [];

  for (const escritorio of escritorios) {
    const r = await executarJob(
      admin,
      "captar-djen",
      async () => {
        const hoje = opcoes.hoje ?? hojeNoFuso(escritorio.timezone);
        const inicio = adicionarDias(hoje, -(opcoes.janelaDias ?? 3));
        const { data: membros, error } = await admin
          .from("escritorio_membros")
          .select("id, usuario_id, nome_completo, oab_numero, oab_uf")
          .eq("escritorio_id", escritorio.id)
          .eq("ativo", true)
          .not("oab_numero", "is", null);
        if (error) throw new Error(error.message);

        const { data: captacao } = await admin
          .from("captacoes")
          .insert({ escritorio_id: escritorio.id, fonte: "djen", iniciada_em: new Date().toISOString(), status: "executando", parametros: { inicio, fim: hoje, oabs: (membros ?? []).map((m) => `${m.oab_numero}/${m.oab_uf}`) } })
          .select("id")
          .single();
        const captacaoId = captacao?.id as string | undefined;

        let recebidos = 0;
        let novos = 0;
        let duplicados = 0;
        const erros: string[] = [];
        const vistos = new Set<string>();

        for (const m of (membros ?? []) as MembroComOab[]) {
          if (!m.oab_numero || !m.oab_uf) continue;
          try {
            const { items: itens } = await djen.consultarTodas({ numeroOab: m.oab_numero, ufOab: m.oab_uf, dataDisponibilizacaoInicio: inicio, dataDisponibilizacaoFim: hoje, itensPorPagina: 100 });
            for (const item of itens) {
              recebidos += 1;
              const p = normalizarPublicacaoDjen(item);
              if (vistos.has(p.id_externo)) continue;
              vistos.add(p.id_externo);
              const resultado = await gravarPublicacao(admin, escritorio.id, captacaoId ?? null, p);
              if (resultado === "nova") novos += 1;
              else duplicados += 1;
            }
          } catch (e) {
            erros.push(`${m.nome_completo} (${m.oab_numero}/${m.oab_uf}): ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        if (captacaoId) {
          await admin
            .from("captacoes")
            .update({ finalizada_em: new Date().toISOString(), status: erros.length ? "parcial" : "ok", itens_recebidos: recebidos, itens_novos: novos, itens_duplicados: duplicados, erros: erros.length ? erros : null })
            .eq("id", captacaoId);
        }
        if (erros.length && novos === 0 && recebidos === 0) throw new Error(erros.join(" | "));
        return { itens: novos, detalhes: { recebidos, novos, duplicados, erros, inicio, fim: hoje } };
      },
      escritorio.id,
    );
    resumo.push({ escritorio: escritorio.nome, ...r });
  }
  return resumo;
}

/** Grava a publicação se ainda não existir. Devolve "nova" ou "duplicada". */
export async function gravarPublicacao(admin: SupabaseClient, escritorioId: string, captacaoId: string | null, p: PublicacaoNormalizada): Promise<"nova" | "duplicada"> {
  const { data: existente } = await admin.from("publicacoes").select("id").eq("escritorio_id", escritorioId).eq("fonte", "djen").eq("id_externo", p.id_externo).maybeSingle();
  if (existente) return "duplicada";

  const hash = hashDedup(p);
  const { data: mesmoConteudo } = await admin.from("publicacoes").select("id").eq("escritorio_id", escritorioId).eq("hash_dedup", hash).maybeSingle();

  let processoId: string | null = null;
  let tribunalId: string | null = null;
  if (p.numero_cnj) {
    const { data: proc } = await admin.from("processos").select("id, tribunal_id").eq("escritorio_id", escritorioId).eq("numero_cnj", p.numero_cnj).maybeSingle();
    processoId = (proc?.id as string | undefined) ?? null;
    tribunalId = (proc?.tribunal_id as string | undefined) ?? null;
  }
  if (!tribunalId && p.tribunal_sigla) {
    const { data: trib } = await admin.schema("ref").from("tribunais").select("id").eq("sigla", p.tribunal_sigla).maybeSingle();
    tribunalId = (trib?.id as string | undefined) ?? null;
  }

  const { error } = await admin.from("publicacoes").insert({
    escritorio_id: escritorioId,
    captacao_id: captacaoId,
    fonte: "djen",
    id_externo: p.id_externo,
    hash_dedup: hash,
    payload_bruto: p.payload_bruto,
    tribunal_id: tribunalId,
    numero_cnj: p.numero_cnj,
    numero_processo_texto: p.numero_processo_texto,
    processo_id: processoId,
    vinculo_tipo: processoId ? "automatico_numero" : null,
    tipo_origem: p.tipo_origem,
    orgao: p.orgao,
    classe: p.classe_nome,
    meio: p.meio,
    data_disponibilizacao: p.data_disponibilizacao,
    texto: p.texto,
    link: p.link,
    destinatarios: p.destinatarios,
    destinatario_advogados: p.destinatario_advogados,
    cancelada: p.cancelada,
    motivo_cancelamento: p.motivo_cancelamento,
    data_cancelamento: p.data_cancelamento,
    status: mesmoConteudo ? "duplicada" : "nova",
    publicacao_anterior_id: (mesmoConteudo?.id as string | undefined) ?? null,
  });
  if (error) throw new Error(`Falha ao gravar publicação ${p.id_externo}: ${error.message}`);
  return mesmoConteudo ? "duplicada" : "nova";
}
