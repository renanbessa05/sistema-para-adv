import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatarData } from "@/lib/utils";

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

const COLUNAS: { status: string; rotulo: string; descricao: string }[] = [
  { status: "a_fazer", rotulo: "A fazer", descricao: "Ainda não iniciadas" },
  { status: "em_andamento", rotulo: "Em andamento", descricao: "Alguém está fazendo" },
  { status: "pronta_para_revisao", rotulo: "Pronta para revisão", descricao: "Aguarda advogado ou sócio" },
  { status: "concluida", rotulo: "Concluída", descricao: "Últimos 7 dias" },
];

const TOM_PRIORIDADE: Record<string, "neutro" | "info" | "alerta" | "perigo"> = { baixa: "neutro", normal: "info", alta: "alerta", critica: "perigo" };

/** Quadro de tarefas por status (server component). Sem arrastar e soltar: a mudança de status é feita no detalhe. */
export function QuadroTarefas({ tarefas, nomes, mostrarExecutor }: { tarefas: CartaoTarefa[]; nomes: Map<string, string>; mostrarExecutor: boolean }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {COLUNAS.map((coluna) => {
        const itens = tarefas.filter((t) => t.status === coluna.status);
        return (
          <section key={coluna.status} className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/60 p-2 dark:border-zinc-800 dark:bg-zinc-900/40">
            <header className="flex items-baseline justify-between px-1">
              <div>
                <h2 className="text-sm font-semibold">{coluna.rotulo}</h2>
                <p className="text-xs text-zinc-500">{coluna.descricao}</p>
              </div>
              <span className="text-xs text-zinc-500">{itens.length}</span>
            </header>
            {itens.length === 0 ? (
              <p className="px-1 py-4 text-center text-xs text-zinc-400">Nenhuma tarefa.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {itens.map((t) => (
                  <li key={t.id} className={`rounded-md border bg-white p-2 text-sm shadow-sm dark:bg-zinc-950 ${t.critica ? "border-red-300 dark:border-red-800" : t.atrasada ? "border-amber-300 dark:border-amber-800" : "border-zinc-200 dark:border-zinc-800"}`}>
                    <Link href={`/tarefas/${t.id}`} className="font-medium hover:underline">
                      {t.titulo}
                    </Link>
                    {t.processos?.numero_cnj_mascara ? (
                      <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
                        <Link href={`/processos/${t.processo_id}`} className="hover:underline">
                          {t.processos.numero_cnj_mascara}
                        </Link>
                      </p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {t.critica ? <Badge tom="perigo">crítica</Badge> : null}
                      {t.atrasada ? <Badge tom="alerta">atrasada</Badge> : null}
                      {t.prioridade !== "normal" ? <Badge tom={TOM_PRIORIDADE[t.prioridade] ?? "neutro"}>{t.prioridade}</Badge> : null}
                      {t.vencimento ? <span className="text-xs text-zinc-500">vence {formatarData(t.vencimento)}</span> : null}
                      {t.prazos ? <span className="text-xs text-zinc-500">· fatal {formatarData(t.prazos.data_final)}</span> : null}
                    </div>
                    {mostrarExecutor ? <p className="mt-1 text-xs text-zinc-500">{t.executor_id ? (nomes.get(t.executor_id) ?? "membro") : "sem executor"}</p> : null}
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
