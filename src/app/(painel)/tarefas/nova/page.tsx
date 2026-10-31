import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMembros, membrosComUsuario } from "@/server/equipe";
import { PRIORIDADES, TIPOS_TAREFA } from "@/server/tarefas";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Campo, GrupoCampos, Input, Select, Textarea } from "@/components/ui/input";
import { Button, classesBotao } from "@/components/ui/button";
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div className="min-w-0">
        <p className="text-[13px] text-zinc-500">
          <Link href="/tarefas" className="font-semibold text-marca-600 hover:underline">
            Tarefas
          </Link>
          <span className="mx-1.5 text-zinc-300">/</span>
          nova
        </p>
        <h1 className="mt-1 text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Nova tarefa</h1>
        <p className="mt-1 text-sm text-zinc-500">Tarefa manual, fora do fio publicação → prazo. Nasce em «A fazer» no quadro do executor.</p>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      <form action={criarTarefa} className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Tarefa manual</CardTitle>
            <CardDescription>{estagiario ? "Estagiário cria tarefa só para si mesmo." : "O responsável é o do processo escolhido (ou você, se não houver processo)."}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <GrupoCampos titulo="O que fazer" colunas={1}>
              <Campo label="Título">
                <Input name="titulo" required placeholder="Ex.: Ligar para o cliente sobre documentos" />
              </Campo>
              <Campo label="Descrição" dica="Opcional. Contexto para quem vai executar.">
                <Textarea name="descricao" rows={3} className="min-h-24" />
              </Campo>
            </GrupoCampos>

            <GrupoCampos titulo="Classificação">
              <Campo label="Tipo">
                <Select name="tipo" defaultValue="outro">
                  {Object.entries(TIPOS_TAREFA).map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Prioridade" dica="Crítica aparece em vermelho no quadro e em /hoje.">
                <Select name="prioridade" defaultValue="normal">
                  {Object.entries(PRIORIDADES).map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Campo>
            </GrupoCampos>

            <GrupoCampos titulo="Processo, executor e prazo">
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
              <Campo label="Executor" dica={estagiario ? "Estagiário só cria para si." : undefined}>
                <Select name="executor_id" defaultValue={sessao.usuarioId} disabled={estagiario}>
                  {membrosComUsuario(membros).map((m) => (
                    <option key={m.usuario_id} value={m.usuario_id}>
                      {m.nome_completo}
                      {m.usuario_id === sessao.usuarioId ? " (eu)" : ""}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Vencimento" dica="Data interna; sem prazo processual ligado.">
                <Input name="vencimento" type="date" />
              </Campo>
            </GrupoCampos>
          </CardContent>
        </Card>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link href="/tarefas" className={classesBotao({ variante: "contorno" })}>
            Cancelar
          </Link>
          <Button type="submit">Criar tarefa</Button>
        </div>
      </form>
    </div>
  );
}
