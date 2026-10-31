import Link from "next/link";
import { Bot, ClipboardCheck, MessageCircle, UserRound } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, Vazio } from "@/components/ui/alert";
import { classesBotao } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Atendimento" };
export const dynamic = "force-dynamic";

const ROTULO_STATUS: Record<string, string> = { enfileirada: "na fila", enviada: "enviada", entregue: "entregue", lida: "lida", falhou: "não enviada" };

function dataHora(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Cuiaba", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function PaginaAtendimento({ searchParams }: { searchParams: Promise<{ conversa?: string }> }) {
  const sessao = await exigirSessao();
  const { conversa: conversaParam } = await searchParams;
  const podeVer = sessao.papel === "socio" || sessao.papel === "advogado";
  if (!podeVer) {
    return <p className="text-sm text-zinc-500">Apenas sócio e advogado acompanham o atendimento ao cliente.</p>;
  }
  const supabase = await criarClienteServidor();
  const { data: conversas } = await supabase
    .from("conversas")
    .select("id, cliente_id, ultima_mensagem_recebida_em, clientes(nome)")
    .eq("escritorio_id", sessao.escritorioId)
    .not("cliente_id", "is", null)
    .order("ultima_mensagem_recebida_em", { ascending: false, nullsFirst: false })
    .limit(50);
  const lista = (conversas ?? []) as unknown as { id: string; cliente_id: string | null; ultima_mensagem_recebida_em: string | null; clientes: { nome: string } | null }[];
  const selecionada = lista.find((c) => c.id === conversaParam) ?? lista[0];

  const { data: mensagens } = selecionada
    ? await supabase.from("mensagens").select("id, direcao, texto, status_entrega, erro, intent, criado_em, aprovacao_id").eq("conversa_id", selecionada.id).order("criado_em", { ascending: true }).limit(200)
    : { data: [] };
  const rascunhos = (mensagens ?? []).filter((m) => m.direcao === "saida" && m.aprovacao_id && m.status_entrega === null).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Atendimento</h1>
          <p className="text-sm text-zinc-500">Conversas com clientes. Respostas livres da IA aparecem aqui como rascunho e só saem depois de aprovadas em Aprovações.</p>
        </div>
        <Link href="/aprovacoes" className={classesBotao({ variante: "contorno" })}>
          <ClipboardCheck aria-hidden />
          Aprovações
        </Link>
      </div>
      {lista.length === 0 ? (
        <Vazio titulo="Nenhuma conversa com cliente ainda" descricao="O contato precisa estar verificado e autorizado em Clientes → Dados e contatos." />
      ) : (
        <div className="grid gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
          <nav aria-label="Conversas" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0">
            {lista.map((c) => {
              const on = c.id === selecionada?.id;
              const nome = c.clientes?.nome ?? "Cliente";
              return (
                <Link key={c.id} href={`/atendimento?conversa=${c.id}`} aria-current={on ? "page" : undefined} className={cn("flex w-56 shrink-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors md:w-auto", on ? "border-marca-200 bg-marca-50 shadow-xs" : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50")}>
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold", on ? "bg-marca-600 text-white" : "bg-zinc-100 text-zinc-600")} aria-hidden>
                    {nome.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block truncate font-semibold", on ? "text-marca-800" : "text-zinc-900")}>{nome}</span>
                    <span className="block text-xs text-zinc-500 tabular-nums">{dataHora(c.ultima_mensagem_recebida_em) || "sem mensagens"}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
          {selecionada ? (
            <Card className="min-w-0">
              <CardHeader className="flex-row items-start justify-between gap-3 border-b border-zinc-100">
                <div className="min-w-0">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {selecionada.cliente_id ? (
                      <Link href={`/clientes/${selecionada.cliente_id}?aba=conversas`} className="hover:text-marca-700">
                        {selecionada.clientes?.nome ?? "Cliente"}
                      </Link>
                    ) : (
                      (selecionada.clientes?.nome ?? "Cliente")
                    )}
                    {rascunhos ? <Badge tom="alerta">{rascunhos} rascunho(s)</Badge> : null}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Rascunhos aguardando aprovação:{" "}
                    <Link href="/aprovacoes" className="font-semibold text-marca-600 hover:underline">
                      abrir Aprovações
                    </Link>
                    .
                  </CardDescription>
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600" aria-hidden>
                  <MessageCircle className="h-[18px] w-[18px]" />
                </span>
              </CardHeader>
              <CardContent className="pt-4">
                {(mensagens ?? []).length === 0 ? (
                  <p className="py-6 text-center text-sm text-zinc-500">Nenhuma mensagem nesta conversa.</p>
                ) : (
                  <ol className="flex flex-col gap-3">
                    {(mensagens ?? []).map((m) => {
                      const entrada = m.direcao === "entrada";
                      const rascunho = m.direcao === "saida" && Boolean(m.aprovacao_id) && m.status_entrega === null;
                      return (
                        <li key={m.id as string} className={cn("flex max-w-[92%] gap-2.5 sm:max-w-[80%]", entrada ? "self-start" : "self-end flex-row-reverse")}>
                          <span className={cn("mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full", entrada ? "bg-zinc-100 text-zinc-600" : "bg-marca-100 text-marca-700")} aria-hidden>
                            {entrada ? <UserRound className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                          </span>
                          <div className={cn("min-w-0 rounded-2xl border px-3.5 py-2.5 text-sm shadow-xs", entrada ? "rounded-tl-md border-zinc-200 bg-white" : rascunho ? "rounded-tr-md border-ouro-300 bg-ouro-50/70" : "rounded-tr-md border-marca-200 bg-marca-50")}>
                            <div className={cn("mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500", entrada ? undefined : "justify-end")}>
                              <span className="font-semibold text-zinc-600">{entrada ? "Cliente" : "Escritório (IA)"}</span>
                              <span className="tabular-nums">{dataHora(m.criado_em as string)}</span>
                              {rascunho ? <Badge tom="alerta">rascunho</Badge> : null}
                              {m.direcao === "saida" && m.status_entrega ? <Badge tom={m.status_entrega === "falhou" ? "perigo" : "contorno"}>{ROTULO_STATUS[m.status_entrega as string] ?? String(m.status_entrega)}</Badge> : null}
                            </div>
                            <p className="leading-relaxed whitespace-pre-line text-zinc-900">{(m.texto as string | null) ?? "(sem texto)"}</p>
                            {m.erro ? (
                              <Alert tom="perigo" className="mt-2 px-2.5 py-2 text-xs">
                                Motivo: {m.erro as string}
                              </Alert>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
