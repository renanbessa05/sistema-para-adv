import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { instanteDeFormulario } from "@/lib/audiencias/datas";
import type { Sessao } from "./sessao";

/**
 * Audiências (lote 8). Criação e leitura usam o cliente do usuário: a RLS decide escritório, sigilo e MFA.
 * Só advogado ou sócio agenda. O horário chega do formulário no fuso do escritório e vira instante UTC aqui.
 */
export class ErroAudiencia extends Error {}

export const TIPOS_AUDIENCIA = ["instrucao", "conciliacao", "una", "julgamento", "outra"] as const;

export interface NovaAudiencia {
  processoId: string;
  tipo: (typeof TIPOS_AUDIENCIA)[number];
  /** AAAA-MM-DDTHH:MM no fuso do escritório. */
  dataHora: string;
  modalidade: "presencial" | "virtual";
  localOuLink: string | null;
  responsavelId: string | null;
  observacoes: string | null;
}

export async function criarAudiencia(supabase: SupabaseClient, sessao: Sessao, d: NovaAudiencia, timezone: string): Promise<string> {
  if (!["socio", "advogado"].includes(sessao.papel)) throw new ErroAudiencia("Apenas advogado ou sócio agenda audiência.");
  let instante: Date;
  try {
    instante = instanteDeFormulario(d.dataHora, timezone);
  } catch (e) {
    throw new ErroAudiencia(e instanceof Error ? e.message : String(e));
  }
  const { data, error } = await supabase
    .from("audiencias")
    .insert({
      escritorio_id: sessao.escritorioId,
      processo_id: d.processoId,
      tipo: d.tipo,
      data_hora: instante.toISOString(),
      modalidade: d.modalidade,
      local_ou_link: d.localOuLink,
      responsavel_id: d.responsavelId,
      observacoes: d.observacoes,
      criado_por: sessao.usuarioId,
    })
    .select("id")
    .single();
  if (error) throw new ErroAudiencia(error.message);
  return data.id as string;
}

export async function listarAudiencias(supabase: SupabaseClient, desde: Date, limite = 200) {
  const { data, error } = await supabase
    .from("audiencias")
    .select("id, tipo, data_hora, modalidade, local_ou_link, status, processo_id, processos(numero_cnj_mascara)")
    .gte("data_hora", desde.toISOString())
    .order("data_hora")
    .limit(limite);
  if (error) throw new ErroAudiencia(error.message);
  return data ?? [];
}
