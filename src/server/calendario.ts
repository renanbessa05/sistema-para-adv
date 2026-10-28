import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { montarCalendario, type Calendario, type DiaSemExpediente } from "@/lib/prazos";

/**
 * Carrega o calendário aplicável a um processo (tribunal + comarca) a partir de ref.feriados e ref.calendario_anos.
 * Feriados nacionais (tribunal_id nulo) valem para todos.
 */
export async function carregarCalendario(
  supabase: SupabaseClient,
  { tribunalId, comarcaId, tribunalSigla = "TJMT" }: { tribunalId: string | null; comarcaId: string | null; tribunalSigla?: string },
): Promise<Calendario> {
  let tribunal = tribunalId;
  if (!tribunal) {
    const { data } = await supabase.schema("ref").from("tribunais").select("id").eq("sigla", tribunalSigla).maybeSingle();
    tribunal = (data?.id as string | undefined) ?? null;
  }
  const consulta = supabase.schema("ref").from("feriados").select("data, descricao, abrangencia, comarca_id, tribunal_id, suspende_prazo, ato_normativo");
  const { data: feriados, error } = tribunal ? await consulta.or(`tribunal_id.is.null,tribunal_id.eq.${tribunal}`) : await consulta.is("tribunal_id", null);
  if (error) throw new Error(`Falha ao carregar feriados: ${error.message}`);

  const dias: DiaSemExpediente[] = (feriados ?? []).map((f) => ({
    data: String(f.data),
    descricao: String(f.descricao),
    abrangencia: f.abrangencia as DiaSemExpediente["abrangencia"],
    comarcaId: (f.comarca_id as string | null) ?? null,
    tribunalId: (f.tribunal_id as string | null) ?? null,
    suspendePrazo: Boolean(f.suspende_prazo),
    atoNormativo: (f.ato_normativo as string | null) ?? null,
  }));

  let anosCobertos: number[] | undefined;
  if (tribunal) {
    const { data: anos } = await supabase.schema("ref").from("calendario_anos").select("ano").eq("tribunal_id", tribunal);
    if (anos && anos.length) anosCobertos = anos.map((a) => Number(a.ano));
  }

  return montarCalendario(dias, { tribunal: tribunalSigla, comarcaId, anosCobertos });
}
