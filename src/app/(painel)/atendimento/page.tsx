import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  const lista = (conversas ?? []) as unknown as { id: string; ultima_mensagem_recebida_em: string | null; clientes: { nome: string } | null }[];
  const selecionada = lista.find((c) => c.id === conversaParam) ?? lista[0];

  const { data: mensagens } = selecionada
    ? await supabase.from("mensagens").select("id, direcao, texto, status_entrega, erro, intent, criado_em, aprovacao_id").eq("conversa_id", selecionada.id).order("criado_em", { ascending: true }).limit(200)
    : { data: [] };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Atendimento</h1>
        <p className="text-sm text-zinc-500">Conversas com clientes. Respostas livres da IA aparecem aqui como rascunho e só saem depois de aprovadas em Aprovações.</p>
      </div>
      {lista.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-4 text-sm text-zinc-500">Nenhuma conversa com cliente ainda. O contato precisa estar verificado e autorizado em Clientes.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
          <nav aria-label="Conversas" className="flex flex-col gap-1">
            {lista.map((c) => (
              <Link key={c.id} href={`/atendimento?conversa=${c.id}`} className={`rounded-md px-3 py-2 text-sm ${c.id === selecionada?.id ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
                <span className="block font-medium">{c.clientes?.nome ?? "Cliente"}</span>
                <span className="block text-xs opacity-70">{dataHora(c.ultima_mensagem_recebida_em)}</span>
              </Link>
            ))}
          </nav>
          {selecionada ? (
            <Card>
              <CardHeader>
                <CardTitle>{selecionada.clientes?.nome ?? "Cliente"}</CardTitle>
                <CardDescription>
                  Rascunhos aguardando aprovação: <Link href="/aprovacoes" className="underline">abrir Aprovações</Link>.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="flex flex-col gap-3">
                  {(mensagens ?? []).map((m) => (
                    <li key={m.id as string} className={`rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800 ${m.direcao === "entrada" ? "" : "bg-zinc-50 dark:bg-zinc-900"}`}>
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span>{m.direcao === "entrada" ? "Cliente" : "Escritório (IA)"}</span>
                        <span>{dataHora(m.criado_em as string)}</span>
                        {m.direcao === "saida" && m.aprovacao_id && m.status_entrega === null ? <Badge tom="alerta">rascunho</Badge> : null}
                        {m.direcao === "saida" && m.status_entrega ? <Badge tom={m.status_entrega === "falhou" ? "perigo" : "contorno"}>{ROTULO_STATUS[m.status_entrega as string] ?? String(m.status_entrega)}</Badge> : null}
                      </div>
                      <p className="whitespace-pre-line">{(m.texto as string | null) ?? "(sem texto)"}</p>
                      {m.erro ? <p className="mt-1 text-xs text-zinc-500">Motivo: {m.erro as string}</p> : null}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
