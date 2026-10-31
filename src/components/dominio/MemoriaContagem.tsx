import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn, formatarData } from "@/lib/utils";

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
    return <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 px-4 py-6 text-center text-sm text-zinc-500">Sem memória de cálculo gravada para este prazo (lançamento manual ou data editada).</p>;
  }
  const indiceFinal = dataFinal ? m.memoria.map((l) => l.data).lastIndexOf(dataFinal) : -1;
  const contados = m.memoria.filter((l) => l.status === "contado").length;
  return (
    <div className="flex flex-col gap-4">
      {m.avisos.length > 0 ? (
        <Alert tom="alerta" titulo={m.avisos.length === 1 ? "Aviso do motor de prazos" : `${m.avisos.length} avisos do motor de prazos`}>
          <ul className={cn("flex flex-col gap-1", m.avisos.length > 1 ? "list-disc pl-4" : undefined)}>
            {m.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {m.memoria.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Resumo rotulo="Dias contados" valor={m.quantidadeEfetiva ?? contados} tom="sucesso" />
          <Resumo rotulo="Dias pulados" valor={m.diasPulados.length} tom="neutro" />
          {dataFinal ? <Resumo rotulo="Data final" valor={formatarData(dataFinal)} tom="marca" /> : null}
        </div>
      ) : null}

      {m.memoria.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-zinc-200">
          <Table>
            <THead>
              <TR>
                <TH className="w-36">Data</TH>
                <TH className="w-14 text-right">Dia</TH>
                <TH className="w-28">Status</TH>
                <TH>Motivo</TH>
              </TR>
            </THead>
            <TBody>
              {m.memoria.map((l, i) => {
                const final = i === indiceFinal;
                const pulado = l.status === "pulado";
                return (
                  <TR key={`${l.data}-${i}`} className={cn(final ? "bg-emerald-50 shadow-[inset_3px_0_0_0_#10b981] hover:bg-emerald-50" : undefined, pulado && !final ? "text-zinc-400" : undefined)}>
                    <TD className="whitespace-nowrap tabular-nums">
                      <span className={cn("font-mono text-xs", final ? "font-bold text-emerald-900" : pulado ? "text-zinc-400" : "text-zinc-800")}>{formatarData(l.data)}</span>
                      <span className={cn("ml-1.5 text-[11px] uppercase", final ? "text-emerald-700" : "text-zinc-400")}>{diaSemanaCurto(l.data)}</span>
                    </TD>
                    <TD className={cn("text-right font-mono text-xs tabular-nums", final ? "font-bold text-emerald-900" : pulado ? "text-zinc-300" : "text-zinc-700")}>{l.dia ?? "—"}</TD>
                    <TD>
                      <Badge tom={final ? "sucesso" : TOM_LINHA[l.status]} className={final ? "ring-1 ring-emerald-300" : undefined}>
                        {final ? "data final" : ROTULO_LINHA[l.status]}
                      </Badge>
                    </TD>
                    <TD className={cn("text-[13px]", final ? "font-semibold text-emerald-900" : pulado ? "text-zinc-400" : "text-zinc-600")}>{l.motivo}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

const TOM_RESUMO = {
  sucesso: "bg-emerald-50 text-emerald-800 ring-emerald-100",
  neutro: "bg-zinc-50 text-zinc-700 ring-zinc-200",
  marca: "bg-marca-50 text-marca-800 ring-marca-100",
} as const;

function Resumo({ rotulo, valor, tom }: { rotulo: string; valor: number | string; tom: keyof typeof TOM_RESUMO }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 rounded-lg px-3 py-1.5 text-xs ring-1", TOM_RESUMO[tom])}>
      <span className="font-medium opacity-80">{rotulo}</span>
      <span className="text-sm font-extrabold tabular-nums">{valor}</span>
    </span>
  );
}
