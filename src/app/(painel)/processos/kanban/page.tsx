import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { garantirFasesPadrao, podeEditarProcesso, proximosPrazosPorProcesso } from "@/server/processos";
import { hojeNoFuso } from "@/lib/prazos";
import { formatarData } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Kanban de processos</h1>
          <p className="text-sm text-zinc-500">Processos ativos e suspensos por fase. {podeMover ? "Para mover, escolha a fase no cartão." : "Seu papel só visualiza."} Fases em Configurações → Fases.</p>
        </div>
        <Link href="/processos" className="text-sm hover:underline">
          Ver em lista →
        </Link>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {error ? <Alert tom="perigo">Não foi possível carregar: {error.message}</Alert> : null}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {colunas.map((coluna) => {
          const itens = cartoes.filter((c) => (coluna.id === null ? !c.fase_id || !faseIds.has(c.fase_id) : c.fase_id === coluna.id));
          return (
            <section key={coluna.id ?? "sem"} className="flex w-64 shrink-0 flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/60 p-2 dark:border-zinc-800 dark:bg-zinc-900/40">
              <header className="flex items-center justify-between px-1">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  {coluna.cor ? <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: coluna.cor }} /> : null}
                  {coluna.nome}
                </h2>
                <span className="text-xs text-zinc-500">{itens.length}</span>
              </header>
              {itens.length === 0 ? <p className="py-4 text-center text-xs text-zinc-400">Nenhum processo.</p> : null}
              {itens.map((c) => {
                const prazo = prazos.get(c.id);
                const cliente = (c.processo_partes ?? []).filter((p) => p.eh_cliente).map((p) => p.nome).join(", ");
                return (
                  <article key={c.id} className="rounded-md border border-zinc-200 bg-white p-2 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                    <Link href={`/processos/${c.id}`} className="font-mono text-xs hover:underline">
                      {c.numero_cnj_mascara}
                    </Link>
                    {c.segredo_justica ? (
                      <Badge tom="perigo" className="ml-1">
                        sigiloso
                      </Badge>
                    ) : null}
                    <p className="truncate text-xs text-zinc-600 dark:text-zinc-300" title={cliente}>
                      {cliente || "sem cliente"}
                    </p>
                    <p className="mt-1 text-xs">
                      {prazo ? (
                        <Badge tom={prazo.status === "vencido" || prazo.data_final < hoje ? "perigo" : prazo.data_final === hoje ? "alerta" : "info"}>prazo {formatarData(prazo.data_final)}</Badge>
                      ) : (
                        <span className="text-zinc-400">sem prazo em aberto</span>
                      )}
                    </p>
                    {podeMover ? (
                      <form action={moverFase.bind(null, c.id)} className="mt-2 flex gap-1">
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
