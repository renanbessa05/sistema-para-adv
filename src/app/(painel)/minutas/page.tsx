import Link from "next/link";
import { ArrowRight, Calculator, FilePlus2, MessageSquareText, Scale, ScanSearch, ShieldCheck } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMinutas, ROTULO_STATUS_MINUTA } from "@/server/minutas";
import { ROTULO_AREA, ROTULO_TIPO_PECA } from "@/lib/ia/schemas/minutas";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, Vazio } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { classesBotao } from "@/components/ui/button";
import { cn, formatarData } from "@/lib/utils";

export const metadata = { title: "Peças" };
export const dynamic = "force-dynamic";

const TOM: Record<string, "info" | "sucesso" | "alerta" | "perigo" | "neutro"> = { rascunho: "neutro", em_etapas: "info", redigida: "info", em_revisao_ia: "info", aguardando_aprovacao: "alerta", devolvida: "perigo", aprovada: "sucesso", protocolada: "sucesso", arquivada: "neutro", cancelada: "neutro" };

const FILTROS = ["", "em_etapas", "redigida", "aguardando_aprovacao", "devolvida", "aprovada", "protocolada"];

/** Central de peças: as três portas de entrada em cima, a lista de minutas no meio, as ferramentas de apoio embaixo. */
export default async function PaginaMinutas({ searchParams }: { searchParams: Promise<{ status?: string; erro?: string; ok?: string }> }) {
  await exigirSessao();
  const { status, erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const minutas = await listarMinutas(supabase, { status: status || undefined });
  const filtroAtual = status ?? "";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Peças</h1>
          <p className="text-sm text-zinc-500">Tudo que se escreve para o processo começa aqui. Peça ligada a prazo e tarefa fecha os dois ao ser protocolada.</p>
        </div>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      <div className="grid gap-3 md:grid-cols-3 md:gap-4">
        <Porta href="/minutas/nova" titulo="Nova peça" descricao="Redação direta, a partir de um rascunho seu, ou em seis etapas com aprovação (caso novo)." Icone={FilePlus2} principal />
        <Porta href="/revisor" titulo="Revisar peça pronta" descricao="Cole o texto já redigido e receba a conferência de quem vai julgar: OK, atenção ou crítico." Icone={ShieldCheck} />
        <Porta href="/varreduras/nova" titulo="Varrer os autos" descricao="A IA lê os autos a favor do cliente e lista os pontos exploráveis; os aprovados viram peça." Icone={ScanSearch} />
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>{minutas.length} minuta(s)</CardTitle>
              <CardDescription className="mt-1">{filtroAtual ? `Mostrando só «${ROTULO_STATUS_MINUTA[filtroAtual] ?? filtroAtual}».` : "Todas as peças do escritório, as mais recentes primeiro."}</CardDescription>
            </div>
          </div>
          <nav className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 whitespace-nowrap [scrollbar-width:none]" aria-label="Filtrar por status">
            {FILTROS.map((s) => {
              const ativo = filtroAtual === s;
              return (
                <Link key={s || "todos"} href={s ? `/minutas?status=${s}` : "/minutas"} aria-current={ativo ? "page" : undefined} className={cn("shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold transition-colors", ativo ? "bg-marca-600 text-white shadow-marca" : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900")}>
                  {s ? ROTULO_STATUS_MINUTA[s] : "Todas"}
                </Link>
              );
            })}
          </nav>
        </CardHeader>
        <CardContent className={minutas.length ? "p-0 pt-1" : undefined}>
          {minutas.length === 0 ? (
            <Vazio
              titulo="Nenhuma minuta."
              descricao={filtroAtual ? "Nenhuma peça neste status. Limpe o filtro para ver todas." : "Comece por «Nova peça» ou cole um texto pronto em «Revisar peça pronta»."}
              acao={
                filtroAtual ? (
                  <Link href="/minutas" className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                    Ver todas
                  </Link>
                ) : (
                  <Link href="/minutas/nova" className={classesBotao({ tamanho: "sm" })}>
                    <FilePlus2 aria-hidden />
                    Nova peça
                  </Link>
                )
              }
            />
          ) : (
            <Table className="[&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
              <THead>
                <TR>
                  <TH>Título</TH>
                  <TH>Peça</TH>
                  <TH>Processo</TH>
                  <TH>Etapa</TH>
                  <TH>Status</TH>
                  <TH>Atualizada</TH>
                </TR>
              </THead>
              <TBody>
                {minutas.map((m) => (
                  <TR key={m.id}>
                    <TD className="max-w-[280px]">
                      <Link href={`/minutas/${m.id}`} className="block truncate font-semibold text-zinc-950 hover:text-marca-700">
                        {m.titulo}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap text-zinc-600">
                      <span className="font-medium text-zinc-800">{ROTULO_TIPO_PECA[m.tipo_peca]}</span>
                      <span className="text-zinc-400"> · </span>
                      {ROTULO_AREA[m.area]}
                      <span className="text-zinc-400"> · </span>
                      modo {m.modo}
                    </TD>
                    <TD className="font-mono text-xs whitespace-nowrap text-zinc-600">{m.processo_numero ?? "—"}</TD>
                    <TD className="whitespace-nowrap text-zinc-600 tabular-nums">{m.modo === "C" ? `${Math.min(m.etapa_atual, 6)}/6` : "redação"}</TD>
                    <TD>
                      <Badge tom={TOM[m.status] ?? "neutro"}>{ROTULO_STATUS_MINUTA[m.status] ?? m.status}</Badge>
                    </TD>
                    <TD className="text-xs whitespace-nowrap text-zinc-500 tabular-nums">{formatarData(m.atualizado_em.slice(0, 10))}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase">Ferramentas de apoio</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Apoio href="/calculos" titulo="Cálculos" descricao="Atualização de dívida e juros com índices do BCB, memória em PDF e aprovação." Icone={Calculator} />
          <Apoio href="/jurisprudencia" titulo="Jurisprudência" descricao="Busca na base importada do escritório, com trechos para citar na peça." Icone={Scale} />
          <Apoio href="/assistente" titulo="Assistente" descricao="Pergunte sobre a carteira em linguagem natural; ela abre a tela certa para agir." Icone={MessageSquareText} />
        </div>
      </section>
    </div>
  );
}

type IconeLucide = React.ComponentType<{ className?: string }>;

/** Porta de entrada grande: ícone, título, descrição e seta. A principal é azul cheio. */
function Porta({ href, titulo, descricao, Icone, principal }: { href: string; titulo: string; descricao: string; Icone: IconeLucide; principal?: boolean }) {
  return (
    <Link href={href} className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-500/40 focus-visible:ring-offset-2">
      <Card className={cn("relative h-full overflow-hidden transition-[box-shadow,border-color,transform] group-hover:shadow-md", principal ? "border-marca-700 bg-gradient-to-br from-marca-600 to-marca-700 text-white shadow-marca group-hover:from-marca-700 group-hover:to-marca-800" : "group-hover:border-zinc-300")}>
        {principal ? <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-white/10 blur-2xl" aria-hidden /> : null}
        <CardContent className="relative flex h-full flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", principal ? "bg-white/15 text-white ring-1 ring-white/20" : "bg-marca-50 text-marca-600")} aria-hidden>
              <Icone className="h-5 w-5" />
            </span>
            <span className={cn("grid h-8 w-8 place-items-center rounded-full transition-transform group-hover:translate-x-0.5", principal ? "bg-white/15 text-white" : "text-zinc-400 ring-1 ring-zinc-200 group-hover:text-marca-600")} aria-hidden>
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
          <div className="min-w-0">
            <p className={cn("text-[16px] leading-tight font-bold tracking-[-0.01em]", principal ? "text-white" : "text-zinc-950")}>{titulo}</p>
            <p className={cn("mt-1 text-[13px] leading-snug", principal ? "text-white/80" : "text-zinc-500")}>{descricao}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/** Ferramenta de apoio: cartão menor, horizontal. */
function Apoio({ href, titulo, descricao, Icone }: { href: string; titulo: string; descricao: string; Icone: IconeLucide }) {
  return (
    <Link href={href} className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-500/40 focus-visible:ring-offset-2">
      <Card className="h-full transition-[box-shadow,border-color] group-hover:border-zinc-300 group-hover:shadow-md">
        <CardContent className="flex h-full items-start gap-3 p-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-600 transition-colors group-hover:bg-marca-50 group-hover:text-marca-600" aria-hidden>
            <Icone className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[14px] font-bold text-zinc-950">
              {titulo}
              <ArrowRight className="h-3.5 w-3.5 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-marca-600" aria-hidden />
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-zinc-500">{descricao}</span>
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
