import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatarData } from "@/lib/utils";

/** Formato gravado em `prazos.memoria_calculo` por `sugerirPrazo` (src/server/prazos.ts). */
export interface LinhaMemoriaView {
  data: string;
  dia: number | null;
  status: "contado" | "pulado" | "marco";
  motivo: string;
}

export interface MemoriaCalculoView {
  memoria: LinhaMemoriaView[];
  avisos: string[];
  diasPulados: { data: string; motivo: string }[];
  quantidadeEfetiva: number | null;
}

const STATUS_VALIDOS = new Set(["contado", "pulado", "marco"]);

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Lê o JSON do banco com tolerância: campos ausentes viram listas vazias; linhas malformadas são descartadas. */
export function normalizarMemoria(json: unknown): MemoriaCalculoView {
  const vazio: MemoriaCalculoView = { memoria: [], avisos: [], diasPulados: [], quantidadeEfetiva: null };
  if (!ehObjeto(json)) return vazio;
  const memoria: LinhaMemoriaView[] = [];
  if (Array.isArray(json.memoria)) {
    for (const l of json.memoria) {
      if (!ehObjeto(l) || typeof l.data !== "string" || typeof l.status !== "string" || !STATUS_VALIDOS.has(l.status)) continue;
      memoria.push({ data: l.data, dia: typeof l.dia === "number" ? l.dia : null, status: l.status as LinhaMemoriaView["status"], motivo: typeof l.motivo === "string" ? l.motivo : "" });
    }
  }
  const avisos = Array.isArray(json.avisos) ? json.avisos.filter((a): a is string => typeof a === "string") : [];
  const diasPulados = Array.isArray(json.diasPulados)
    ? json.diasPulados.filter((d): d is { data: string; motivo: string } => ehObjeto(d) && typeof d.data === "string" && typeof d.motivo === "string")
    : [];
  const quantidadeEfetiva = typeof json.quantidadeEfetiva === "number" ? json.quantidadeEfetiva : null;
  return { memoria, avisos, diasPulados, quantidadeEfetiva };
}

const NOMES_DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function diaSemanaCurto(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return NOMES_DIA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()] ?? "";
}

const ROTULO_LINHA: Record<LinhaMemoriaView["status"], string> = { contado: "contado", pulado: "pulado", marco: "marco" };
const TOM_LINHA: Record<LinhaMemoriaView["status"], "sucesso" | "neutro" | "info"> = { contado: "sucesso", pulado: "neutro", marco: "info" };

/**
 * Memória de contagem linha a linha (data, dia, status, motivo), com avisos e destaque do dia final.
 * `dataFinal` é a data final atual do prazo; a última linha com essa data é destacada.
 */
export function MemoriaContagem({ memoria, dataFinal }: { memoria: unknown; dataFinal?: string | null }) {
  const m = normalizarMemoria(memoria);
  if (m.memoria.length === 0 && m.avisos.length === 0) {
    return <p className="text-sm text-zinc-500">Sem memória de cálculo gravada para este prazo (lançamento manual ou data editada).</p>;
  }
  const indiceFinal = dataFinal ? m.memoria.map((l) => l.data).lastIndexOf(dataFinal) : -1;
  return (
    <div className="flex flex-col gap-3">
      {m.avisos.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900 dark:text-amber-200">
          {m.avisos.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      ) : null}
      {m.quantidadeEfetiva !== null ? <p className="text-xs text-zinc-500">Quantidade efetiva contada: {m.quantidadeEfetiva} dia(s) · {m.diasPulados.length} dia(s) pulado(s)</p> : null}
      {m.memoria.length > 0 ? (
        <Table>
          <THead>
            <TR>
              <TH>Data</TH>
              <TH className="text-right">Dia</TH>
              <TH>Status</TH>
              <TH>Motivo</TH>
            </TR>
          </THead>
          <TBody>
            {m.memoria.map((l, i) => {
              const final = i === indiceFinal;
              return (
                <TR key={`${l.data}-${i}`} className={final ? "bg-emerald-50 font-semibold dark:bg-emerald-950/40" : l.status === "pulado" ? "text-zinc-500" : ""}>
                  <TD className="whitespace-nowrap font-mono text-xs">
                    {formatarData(l.data)} <span className="text-zinc-400">{diaSemanaCurto(l.data)}</span>
                  </TD>
                  <TD className="text-right font-mono text-xs">{l.dia ?? ""}</TD>
                  <TD>
                    <Badge tom={final ? "sucesso" : TOM_LINHA[l.status]}>{final ? "data final" : ROTULO_LINHA[l.status]}</Badge>
                  </TD>
                  <TD className="text-sm">{l.motivo}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      ) : null}
    </div>
  );
}
