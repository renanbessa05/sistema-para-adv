import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarConversas } from "@/server/assistente";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatarDataHora } from "@/lib/utils";
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
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Assistente</h1>
        <p className="text-sm text-zinc-500">Pergunte sobre processos, publicações, prazos, tarefas e documentos. Ações de escrita pedem confirmação; peças, contratos e cálculos têm telas próprias.</p>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Nova conversa</CardTitle>
          <CardDescription>Escolha um processo para a assistente já saber do que se trata, ou deixe em branco.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={novaConversaAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input name="titulo" placeholder="Título (opcional)" maxLength={120} />
            <Select name="processo_id" defaultValue={processo ?? ""} aria-label="Processo">
              <option value="">Sem processo em foco</option>
              {(processos ?? []).map((p) => (
                <option key={p.id as string} value={p.id as string}>
                  {(p.numero_cnj_mascara as string | null) ?? "sem número"}
                </option>
              ))}
            </Select>
            <Button type="submit">Começar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suas conversas</CardTitle>
        </CardHeader>
        <CardContent>
          {conversas.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma conversa ainda.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {conversas.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                  <Link href={`/assistente/${c.id}`} className="hover:underline">
                    {c.titulo ?? "Conversa"}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-zinc-500">
                    {c.encerrada_em ? <Badge tom="neutro">encerrada</Badge> : <Badge tom="sucesso">aberta</Badge>}
                    {c.turnos} turno(s) · {formatarDataHora(c.atualizado_em, timeZone)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
