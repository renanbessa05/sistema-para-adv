import Link from "next/link";
import { List, Lock } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { garantirFasesPadrao, podeEditarProcesso, proximosPrazosPorProcesso } from "@/server/processos";
import { hojeNoFuso } from "@/lib/prazos";
import { formatarData } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Button, classesBotao } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { moverFase } from "../actions";

export const metadata = { title: "Kanban de processos" };
export const dynamic = "force-dynamic";

type Cartao = { id: string; numero_cnj_mascara: string | null; fase_id: string | null; segredo_justica: boolean; processo_partes: { nome: string; eh_cliente: boolean }[] | null };

export default async function PaginaKanban({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const sessao = await exigirSessao();
  const { erro } = await searchParams;
  const supabase = await criarClienteServidor();
  const podeMover = podeEditarProcesso(sessao.papel);

  const [{ data: escritorio }, fases, { data: processos, error }] = await Promise.all([
    supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).maybeSingle(),
    garantirFasesPadrao(supabase, sessao.escritorioId),
    supabase.from("processos").select("id, numero_cnj_mascara, fase_id, segredo_justica, processo_partes(nome, eh_cliente)").eq("escritorio_id", sessao.escritorioId).in("status", ["ativo", "suspenso"]).order("atualizado_em", { ascending: false }).limit(500),
  ]);
  const hoje = hojeNoFuso((escritorio?.timezone as string | undefined) ?? "America/Cuiaba");
  const cartoes = (processos ?? []) as unknown as Cartao[];
  const prazos = await proximosPrazosPorProcesso(supabase, cartoes.map((c) => c.id));
  const faseIds = new Set(fases.map((f) => f.id));
  const colunas = [...fases.map((f) => ({ id: f.id as string | null, nome: f.nome, cor: f.cor })), { id: null, nome: "Sem fase", cor: null }];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Kanban de processos</h1>
          <p className="text-sm text-zinc-500">Processos ativos e suspensos por fase. {podeMover ? "Para mover, escolha a fase no cartão." : "Seu papel só visualiza."} Fases em Configurações → Fases.</p>
        </div>
        <Link href="/processos" className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
          <List aria-hidden />
          Ver em lista
        </Link>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {error ? <Alert tom="perigo">Não foi possível carregar: {error.message}</Alert> : null}

      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
        {colunas.map((coluna) => {
          const itens = cartoes.filter((c) => (coluna.id === null ? !c.fase_id || !faseIds.has(c.fase_id) : c.fase_id === coluna.id));
          return (
            <section key={coluna.id ?? "sem"} className="flex w-72 shrink-0 flex-col gap-2 rounded-2xl border border-zinc-200 bg-zinc-100/60 p-2.5">
              <header className="flex items-start justify-between gap-2 px-1 pt-0.5">
                <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-950">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: coluna.cor ?? "#94a3b8" }} aria-hidden />
                  {coluna.nome}
                </h2>
                <span className="rounded-full bg-white px-2 text-xs font-bold leading-5 text-zinc-600 shadow-xs ring-1 ring-zinc-200 tabular-nums">{itens.length}</span>
              </header>
              {itens.length === 0 ? <p className="px-1 py-6 text-center text-xs text-zinc-400">Nenhum processo.</p> : null}
              {itens.map((c) => {
                const prazo = prazos.get(c.id);
                const cliente = (c.processo_partes ?? []).filter((p) => p.eh_cliente).map((p) => p.nome).join(", ");
                const urgente = prazo ? prazo.status === "vencido" || prazo.data_final <= hoje : false;
                return (
                  <article key={c.id} className="rounded-xl border-l-[3px] bg-white p-3 text-sm shadow-xs ring-1 ring-zinc-200 transition-shadow hover:shadow-md" style={{ borderLeftColor: urgente ? "#dc2626" : (coluna.cor ?? "transparent") }}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link href={`/processos/${c.id}`} className="font-mono text-xs font-semibold text-zinc-950 hover:text-marca-700">
                        {c.numero_cnj_mascara}
                      </Link>
                      {c.segredo_justica ? (
                        <Badge tom="perigo">
                          <Lock className="h-3 w-3" aria-hidden />
                          sigiloso
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-zinc-600" title={cliente}>
                      {cliente || "sem cliente"}
                    </p>
                    <p className="mt-2 text-xs">
                      {prazo ? (
                        <Badge tom={prazo.status === "vencido" || prazo.data_final < hoje ? "perigo" : prazo.data_final === hoje ? "alerta" : "info"}>prazo {formatarData(prazo.data_final)}</Badge>
                      ) : (
                        <span className="text-zinc-400">sem prazo em aberto</span>
                      )}
                    </p>
                    {podeMover ? (
                      <form action={moverFase.bind(null, c.id)} className="mt-2.5 flex gap-1.5 border-t border-zinc-100 pt-2.5">
                        <input type="hidden" name="voltar" value="/processos/kanban" />
                        <Select name="fase_id" defaultValue={c.fase_id && faseIds.has(c.fase_id) ? c.fase_id : ""} className="h-8 text-xs" aria-label="Mover para a fase">
                          <option value="">Sem fase</option>
                          {fases.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.nome}
                            </option>
                          ))}
                        </Select>
                        <Button type="submit" tamanho="sm" variante="secundaria">
                          Mover
                        </Button>
                      </form>
                    ) : null}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
