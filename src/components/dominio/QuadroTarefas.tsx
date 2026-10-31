import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn, formatarData } from "@/lib/utils";

export interface CartaoTarefa {
  id: string;
  titulo: string;
  tipo: string;
  status: string;
  prioridade: string;
  vencimento: string | null;
  executor_id: string | null;
  processo_id: string | null;
  prazo_id: string | null;
  processos: { numero_cnj_mascara: string | null } | null;
  prazos: { data_final: string; status: string } | null;
  atrasada: boolean;
  critica: boolean;
}

const COLUNAS: { status: string; rotulo: string; descricao: string; cor: string }[] = [
  { status: "a_fazer", rotulo: "A fazer", descricao: "Ainda não iniciadas", cor: "bg-zinc-400" },
  { status: "em_andamento", rotulo: "Em andamento", descricao: "Alguém está fazendo", cor: "bg-marca-500" },
  { status: "pronta_para_revisao", rotulo: "Pronta para revisão", descricao: "Aguarda advogado ou sócio", cor: "bg-ouro-500" },
  { status: "concluida", rotulo: "Concluída", descricao: "Últimos 7 dias", cor: "bg-emerald-500" },
];

const TOM_PRIORIDADE: Record<string, "neutro" | "info" | "alerta" | "perigo"> = { baixa: "neutro", normal: "info", alta: "alerta", critica: "perigo" };

/** Quadro de tarefas por status (server component). Sem arrastar e soltar: a mudança de status é feita no detalhe. */
export function QuadroTarefas({ tarefas, nomes, mostrarExecutor }: { tarefas: CartaoTarefa[]; nomes: Map<string, string>; mostrarExecutor: boolean }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {COLUNAS.map((coluna) => {
        const itens = tarefas.filter((t) => t.status === coluna.status);
        return (
          <section key={coluna.status} className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-zinc-100/60 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/40">
            <header className="flex items-start justify-between gap-2 px-1 pt-0.5">
              <div className="flex items-start gap-2">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", coluna.cor)} aria-hidden />
                <div>
                  <h2 className="text-sm font-bold text-zinc-950">{coluna.rotulo}</h2>
                  <p className="text-xs text-zinc-500">{coluna.descricao}</p>
                </div>
              </div>
              <span className="rounded-full bg-white px-2 text-xs font-bold leading-5 text-zinc-600 shadow-xs ring-1 ring-zinc-200 tabular-nums">{itens.length}</span>
            </header>
            {itens.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-zinc-400">Nenhuma tarefa.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {itens.map((t) => (
                  <li key={t.id} className={cn("rounded-xl border-l-[3px] bg-white p-3 text-sm shadow-xs ring-1 ring-zinc-200 transition-shadow hover:shadow-md dark:bg-zinc-950", t.critica ? "border-l-red-500" : t.atrasada ? "border-l-ouro-500" : "border-l-transparent")}>
                    <Link href={`/tarefas/${t.id}`} className="font-semibold text-zinc-950 hover:text-marca-700">
                      {t.titulo}
                    </Link>
                    {t.processos?.numero_cnj_mascara ? (
                      <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
                        <Link href={`/processos/${t.processo_id}`} className="hover:underline">
                          {t.processos.numero_cnj_mascara}
                        </Link>
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {t.critica ? <Badge tom="perigo">crítica</Badge> : null}
                      {t.atrasada ? <Badge tom="alerta">atrasada</Badge> : null}
                      {t.prioridade !== "normal" ? <Badge tom={TOM_PRIORIDADE[t.prioridade] ?? "neutro"}>{t.prioridade}</Badge> : null}
                      {t.vencimento ? <span className="text-xs text-zinc-500 tabular-nums">vence {formatarData(t.vencimento)}</span> : null}
                      {t.prazos ? <span className="text-xs text-zinc-500 tabular-nums">· fatal {formatarData(t.prazos.data_final)}</span> : null}
                    </div>
                    {mostrarExecutor ? <p className="mt-1.5 text-xs text-zinc-500">{t.executor_id ? (nomes.get(t.executor_id) ?? "membro") : "sem executor"}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
