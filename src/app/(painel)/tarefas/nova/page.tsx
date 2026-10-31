import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMembros, membrosComUsuario } from "@/server/equipe";
import { PRIORIDADES, TIPOS_TAREFA } from "@/server/tarefas";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Campo, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { criarTarefa } from "../actions";

export const metadata = { title: "Nova tarefa" };
export const dynamic = "force-dynamic";

export default async function PaginaNovaTarefa({ searchParams }: { searchParams: Promise<{ processo?: string; erro?: string }> }) {
  const sessao = await exigirSessao();
  const { processo, erro } = await searchParams;
  const supabase = await criarClienteServidor();
  const estagiario = sessao.papel === "estagiario";

  const [membros, { data: processos }] = await Promise.all([
    listarMembros(supabase, sessao.escritorioId),
    supabase.from("processos").select("id, numero_cnj_mascara, processo_partes(nome, eh_cliente)").eq("escritorio_id", sessao.escritorioId).in("status", ["ativo", "suspenso"]).order("atualizado_em", { ascending: false }).limit(500),
  ]);
  type P = { id: string; numero_cnj_mascara: string | null; processo_partes: { nome: string; eh_cliente: boolean }[] | null };
  const lista = (processos ?? []) as unknown as P[];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link href="/tarefas" className="text-sm text-zinc-500 hover:underline">
          ← Tarefas
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Nova tarefa</h1>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      <form action={criarTarefa} className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Tarefa manual</CardTitle>
            <CardDescription>{estagiario ? "Estagiário cria tarefa só para si mesmo." : "O responsável é o do processo escolhido (ou você, se não houver processo)."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Campo label="Título" className="sm:col-span-2">
              <Input name="titulo" required placeholder="Ex.: Ligar para o cliente sobre documentos" />
            </Campo>
            <Campo label="Tipo">
              <Select name="tipo" defaultValue="outro">
                {Object.entries(TIPOS_TAREFA).map(([v, r]) => (
                  <option key={v} value={v}>
                    {r}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Prioridade">
              <Select name="prioridade" defaultValue="normal">
                {Object.entries(PRIORIDADES).map(([v, r]) => (
                  <option key={v} value={v}>
                    {r}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Processo (opcional)" className="sm:col-span-2">
              <Select name="processo_id" defaultValue={processo ?? ""}>
                <option value="">Sem processo</option>
                {lista.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.numero_cnj_mascara} — {(p.processo_partes ?? []).filter((x) => x.eh_cliente).map((x) => x.nome).join(", ") || "sem cliente"}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Executor">
              <Select name="executor_id" defaultValue={sessao.usuarioId} disabled={estagiario}>
                {membrosComUsuario(membros).map((m) => (
                  <option key={m.usuario_id} value={m.usuario_id}>
                    {m.nome_completo}
                    {m.usuario_id === sessao.usuarioId ? " (eu)" : ""}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Vencimento">
              <Input name="vencimento" type="date" />
            </Campo>
            <Campo label="Descrição" className="sm:col-span-2">
              <Textarea name="descricao" rows={3} />
            </Campo>
          </CardContent>
        </Card>
        <div className="flex justify-end gap-2">
          <Link href="/tarefas" className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Cancelar
          </Link>
          <Button type="submit">Criar tarefa</Button>
        </div>
      </form>
    </div>
  );
}
