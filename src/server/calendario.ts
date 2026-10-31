import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { montarCalendario, type Calendario, type DiaSemExpediente } from "@/lib/prazos";

/** Id do tribunal pela sigla. É referência global e quase fixa: guarda só o que já foi lido com sucesso. */
const idsDeTribunal = new Map<string, string>();

async function idDoTribunal(supabase: SupabaseClient, sigla: string): Promise<string | null> {
  const guardado = idsDeTribunal.get(sigla);
  if (guardado) return guardado;
  const { data } = await supabase.schema("ref").from("tribunais").select("id").eq("sigla", sigla).maybeSingle();
  const id = (data?.id as string | undefined) ?? null;
  if (id) idsDeTribunal.set(sigla, id);
  return id;
}

/**
 * Carrega o calendário aplicável a um processo (tribunal + comarca) a partir de ref.feriados e ref.calendario_anos.
 * Feriados nacionais (tribunal_id nulo) valem para todos.
 */
export async function carregarCalendario(
  supabase: SupabaseClient,
  { tribunalId, comarcaId, tribunalSigla = "TJMT" }: { tribunalId: string | null; comarcaId: string | null; tribunalSigla?: string },
): Promise<Calendario> {
  const tribunal = tribunalId ?? (await idDoTribunal(supabase, tribunalSigla));
  const consulta = supabase.schema("ref").from("feriados").select("data, descricao, abrangencia, comarca_id, tribunal_id, suspende_prazo, ato_normativo");
  const buscaAnos = tribunal ? supabase.schema("ref").from("calendario_anos").select("ano").eq("tribunal_id", tribunal) : null;
  const [{ data: feriados, error }, resultadoAnos] = await Promise.all([tribunal ? consulta.or(`tribunal_id.is.null,tribunal_id.eq.${tribunal}`) : consulta.is("tribunal_id", null), buscaAnos]);
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

  const anos = resultadoAnos?.data ?? [];
  const anosCobertos = anos.length ? anos.map((a) => Number(a.ano)) : undefined;

  return montarCalendario(dias, { tribunal: tribunalSigla, comarcaId, anosCobertos });
}
