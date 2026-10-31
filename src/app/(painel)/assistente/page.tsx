import Link from "next/link";
import { ChevronRight, MessageSquareText, Sparkles } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarConversas } from "@/server/assistente";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Vazio } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, formatarDataHora } from "@/lib/utils";
import { novaConversaAction } from "./actions";

export const metadata = { title: "Assistente" };
export const dynamic = "force-dynamic";

export default async function PaginaAssistente({ searchParams }: { searchParams: Promise<{ erro?: string; processo?: string }> }) {
  const sessao = await exigirSessao();
  const { erro, processo } = await searchParams;
  const supabase = await criarClienteServidor();
  const [conversas, { data: processos }, { data: escritorio }] = await Promise.all([
    listarConversas(supabase, sessao),
    supabase.from("processos").select("id, numero_cnj_mascara").in("status", ["ativo", "suspenso"]).order("atualizado_em", { ascending: false }).limit(300),
    supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).maybeSingle(),
  ]);
  const timeZone = (escritorio?.timezone as string | undefined) ?? "America/Cuiaba";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Assistente</h1>
          <p className="text-sm text-zinc-500">Pergunte sobre processos, publicações, prazos, tarefas e documentos. Ações de escrita pedem confirmação; peças, contratos e cálculos têm telas próprias.</p>
        </div>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}

      <Card className="overflow-hidden border-marca-200 bg-gradient-to-br from-marca-50/70 to-white">
        <CardHeader className="flex-row items-start gap-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-marca-600 text-white shadow-marca" aria-hidden>
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle>Nova conversa</CardTitle>
            <CardDescription className="mt-1">Escolha um processo para a assistente já saber do que se trata, ou deixe em branco.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form action={novaConversaAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <Campo label="Título (opcional)">
              <Input name="titulo" placeholder="Título (opcional)" maxLength={120} className="bg-white" />
            </Campo>
            <Campo label="Processo em foco">
              <Select name="processo_id" defaultValue={processo ?? ""} aria-label="Processo" className="bg-white">
                <option value="">Sem processo em foco</option>
                {(processos ?? []).map((p) => (
                  <option key={p.id as string} value={p.id as string}>
                    {(p.numero_cnj_mascara as string | null) ?? "sem número"}
                  </option>
                ))}
              </Select>
            </Campo>
            <Button type="submit" className="h-10 w-full sm:w-auto">
              Começar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suas conversas</CardTitle>
          <CardDescription>As mais recentes primeiro. Conversas encerradas ficam só para leitura.</CardDescription>
        </CardHeader>
        <CardContent className={conversas.length ? "p-0 pt-1" : undefined}>
          {conversas.length === 0 ? (
            <Vazio titulo="Nenhuma conversa ainda." descricao="Comece uma acima: pergunte, por exemplo, «quais meus prazos da semana?»." />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {conversas.map((c) => (
                <li key={c.id}>
                  <Link href={`/assistente/${c.id}`} className="group grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 transition-colors hover:bg-marca-50/40">
                    <span className={cn("grid h-9 w-9 place-items-center rounded-lg", c.encerrada_em ? "bg-zinc-100 text-zinc-400" : "bg-marca-50 text-marca-600")} aria-hidden>
                      <MessageSquareText className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-zinc-950 group-hover:text-marca-700">{c.titulo ?? "Conversa"}</span>
                      <span className="block text-xs text-zinc-500 tabular-nums">
                        {c.turnos} turno(s) · {formatarDataHora(c.atualizado_em, timeZone)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {c.encerrada_em ? <Badge tom="neutro">encerrada</Badge> : <Badge tom="sucesso">aberta</Badge>}
                      <ChevronRight className="hidden h-4 w-4 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-marca-600 sm:block" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
