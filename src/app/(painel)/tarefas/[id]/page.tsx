import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMembros, mapaNomes, membrosComUsuario } from "@/server/equipe";
import { classificarTarefa, EVENTOS_TAREFA, permissoesTarefa, PRIORIDADES, STATUS_TAREFA, TIPOS_TAREFA } from "@/server/tarefas";
import { hojeNoFuso } from "@/lib/prazos";
import { formatarData, formatarDataHora } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Campo, Input, Select, Textarea } from "@/components/ui/input";
import { alterarStatusTarefa, cancelarTarefa, concluirTarefa, editarTarefa, reatribuirTarefa } from "../actions";

export const metadata = { title: "Tarefa" };
export const dynamic = "force-dynamic";

type Tarefa = {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: string;
  origem: string;
  status: string;
  prioridade: string;
  vencimento: string | null;
  executor_id: string | null;
  responsavel_id: string | null;
  processo_id: string | null;
  prazo_id: string | null;
  publicacao_id: string | null;
  criado_por_id: string | null;
  criado_por_tipo: string;
  concluida_em: string | null;
  concluida_por: string | null;
  cancelada_motivo: string | null;
  criado_em: string;
  processos: { numero_cnj_mascara: string | null; segredo_justica: boolean } | null;
  prazos: { data_final: string; data_interna: string | null; status: string; ato_descricao: string | null } | null;
};

const TOM_STATUS: Record<string, "info" | "alerta" | "sucesso" | "neutro"> = { a_fazer: "neutro", em_andamento: "info", pronta_para_revisao: "alerta", concluida: "sucesso", cancelada: "neutro" };

export default async function PaginaTarefa({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string; editar?: string }> }) {
  const sessao = await exigirSessao();
  const { id } = await params;
  const { erro, ok, editar } = await searchParams;
  const supabase = await criarClienteServidor();

  const { data: bruto } = await supabase
    .from("tarefas")
    .select("id, titulo, descricao, tipo, origem, status, prioridade, vencimento, executor_id, responsavel_id, processo_id, prazo_id, publicacao_id, criado_por_id, criado_por_tipo, concluida_em, concluida_por, cancelada_motivo, criado_em, processos(numero_cnj_mascara, segredo_justica), prazos(data_final, data_interna, status, ato_descricao)")
    .eq("id", id)
    .eq("escritorio_id", sessao.escritorioId)
    .maybeSingle();
  if (!bruto) notFound();

  const [{ data: escritorio }, membros, { data: eventos }] = await Promise.all([
    supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).maybeSingle(),
    listarMembros(supabase, sessao.escritorioId, { somenteAtivos: false }),
    supabase.from("tarefa_eventos").select("id, tipo, de_usuario_id, para_usuario_id, usuario_id, dados, criado_em").eq("tarefa_id", id).order("criado_em", { ascending: true }),
  ]);
  const timeZone = (escritorio?.timezone as string | undefined) ?? "America/Cuiaba";
  const hoje = hojeNoFuso(timeZone);
  const tarefa = classificarTarefa(bruto as unknown as Tarefa, hoje);
  const nomes = mapaNomes(membros);
  const nome = (uid: string | null | undefined) => (uid ? (nomes.get(uid) ?? "membro") : "sistema");
  const pode = permissoesTarefa(sessao, tarefa);
  const modoEdicao = editar === "1" && pode.editar;
  const prazoAberto = tarefa.prazos && ["confirmado", "prorrogado", "vencido"].includes(tarefa.prazos.status);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/tarefas" className="text-sm text-zinc-500 hover:underline">
            ← Tarefas
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {tarefa.titulo}
            <Badge tom={TOM_STATUS[tarefa.status] ?? "neutro"}>{STATUS_TAREFA[tarefa.status] ?? tarefa.status}</Badge>
            {tarefa.critica ? <Badge tom="perigo">crítica</Badge> : null}
            {tarefa.atrasada ? <Badge tom="alerta">atrasada</Badge> : null}
          </h1>
          <p className="text-sm text-zinc-500">
            {TIPOS_TAREFA[tarefa.tipo] ?? tarefa.tipo} · prioridade {PRIORIDADES[tarefa.prioridade] ?? tarefa.prioridade} · origem {tarefa.origem}
          </p>
        </div>
        {pode.editar ? (
          <Link href={modoEdicao ? `/tarefas/${id}` : `/tarefas/${id}?editar=1`} className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            {modoEdicao ? "Fechar edição" : "Editar"}
          </Link>
        ) : null}
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Detalhes</CardTitle>
          </CardHeader>
          <CardContent>
            {modoEdicao ? (
              <form action={editarTarefa.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
                <Campo label="Título" className="sm:col-span-2">
                  <Input name="titulo" required defaultValue={tarefa.titulo} />
                </Campo>
                <Campo label="Vencimento (data interna)">
                  <Input name="vencimento" type="date" defaultValue={tarefa.vencimento ?? ""} />
                </Campo>
                <Campo label="Prioridade">
                  <Select name="prioridade" defaultValue={tarefa.prioridade}>
                    {Object.entries(PRIORIDADES).map(([v, r]) => (
                      <option key={v} value={v}>
                        {r}
                      </option>
                    ))}
                  </Select>
                </Campo>
                <Campo label="Descrição" className="sm:col-span-2">
                  <Textarea name="descricao" defaultValue={tarefa.descricao ?? ""} rows={3} />
                </Campo>
                <div className="flex justify-end sm:col-span-2">
                  <Button type="submit">Salvar</Button>
                </div>
              </form>
            ) : (
              <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                <Item rotulo="Executor" valor={tarefa.executor_id ? nome(tarefa.executor_id) : "sem executor"} />
                <Item rotulo="Responsável" valor={tarefa.responsavel_id ? nome(tarefa.responsavel_id) : "—"} />
                <Item rotulo="Vencimento (data interna)" valor={formatarData(tarefa.vencimento)} />
                <Item rotulo="Criada em" valor={`${formatarDataHora(tarefa.criado_em, timeZone)} por ${tarefa.criado_por_tipo === "usuario" ? nome(tarefa.criado_por_id) : tarefa.criado_por_tipo}`} />
                {tarefa.processo_id ? (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500">Processo</dt>
                    <dd>
                      <Link href={`/processos/${tarefa.processo_id}`} className="font-mono text-xs hover:underline">
                        {tarefa.processos?.numero_cnj_mascara ?? tarefa.processo_id}
                      </Link>
                      {tarefa.processos?.segredo_justica ? (
                        <Badge tom="perigo" className="ml-2">
                          sigiloso
                        </Badge>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
                {tarefa.prazo_id && tarefa.prazos ? (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500">Prazo ligado</dt>
                    <dd>
                      <Link href={`/prazos/${tarefa.prazo_id}`} className="hover:underline">
                        {tarefa.prazos.ato_descricao ?? "Prazo"} · fatal {formatarData(tarefa.prazos.data_final)}
                      </Link>{" "}
                      <Badge tom={tarefa.prazos.status === "vencido" ? "perigo" : "contorno"}>{tarefa.prazos.status}</Badge>
                    </dd>
                  </div>
                ) : null}
                {tarefa.publicacao_id ? (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500">Publicação</dt>
                    <dd>
                      <Link href={`/publicacoes/${tarefa.publicacao_id}`} className="hover:underline">
                        ver publicação
                      </Link>
                    </dd>
                  </div>
                ) : null}
                {tarefa.descricao ? <Item rotulo="Descrição" valor={tarefa.descricao} className="sm:col-span-2" /> : null}
                {tarefa.concluida_em ? <Item rotulo="Concluída" valor={`${formatarDataHora(tarefa.concluida_em, timeZone)} por ${nome(tarefa.concluida_por)}`} /> : null}
                {tarefa.cancelada_motivo ? <Item rotulo="Motivo do cancelamento" valor={tarefa.cancelada_motivo} /> : null}
              </dl>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Ações</CardTitle>
              <CardDescription>{sessao.papel === "estagiario" ? "Estagiário leva a tarefa até “pronta para revisão”." : "As regras de quem pode o quê estão no banco; aqui só aparece o que o seu papel permite."}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {pode.mover ? (
                <form action={alterarStatusTarefa.bind(null, id)}>
                  <input type="hidden" name="status" value={tarefa.status === "a_fazer" ? "em_andamento" : "pronta_para_revisao"} />
                  <Button type="submit" variante="secundaria" className="w-full">
                    {tarefa.status === "a_fazer" ? "Começar (em andamento)" : "Enviar para revisão"}
                  </Button>
                </form>
              ) : null}
              {pode.concluir ? (
                <form action={concluirTarefa.bind(null, id)} className="flex flex-col gap-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                  {prazoAberto ? (
                    <label className="inline-flex items-start gap-2">
                      <input type="checkbox" name="protocolado" className="mt-0.5" />
                      <span>
                        Protocolado? Marcar o prazo <strong>{tarefa.prazos?.ato_descricao ?? ""}</strong> como cumprido.
                      </span>
                    </label>
                  ) : null}
                  <Button type="submit" className="w-full">
                    Concluir tarefa
                  </Button>
                </form>
              ) : null}
              {pode.cancelar ? (
                <form action={cancelarTarefa.bind(null, id)} className="flex flex-col gap-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                  <Input name="motivo" required placeholder="Motivo do cancelamento" />
                  <Button type="submit" variante="perigo" className="w-full">
                    Cancelar tarefa
                  </Button>
                </form>
              ) : null}
              {!pode.mover && !pode.concluir && !pode.cancelar && !pode.reatribuir ? <p className="text-zinc-500">Nenhuma ação disponível para o seu papel nesta tarefa.</p> : null}
            </CardContent>
          </Card>

          {pode.reatribuir ? (
            <Card>
              <CardHeader>
                <CardTitle>Reatribuir</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={reatribuirTarefa.bind(null, id)} className="flex flex-col gap-2 text-sm">
                  <Select name="para_usuario" defaultValue="" required aria-label="Novo executor">
                    <option value="">Novo executor…</option>
                    {membrosComUsuario(membros)
                      .filter((m) => m.ativo && m.usuario_id !== tarefa.executor_id)
                      .map((m) => (
                        <option key={m.usuario_id} value={m.usuario_id}>
                          {m.nome_completo}
                        </option>
                      ))}
                  </Select>
                  <Input name="motivo" placeholder="Motivo (opcional)" />
                  <Button type="submit" variante="secundaria">
                    Reatribuir
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          {(eventos ?? []).length === 0 ? (
            <p className="text-sm text-zinc-500">Sem eventos.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {(eventos ?? []).map((e) => {
                const dados = (e.dados ?? {}) as Record<string, unknown>;
                return (
                  <li key={e.id as string} className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-baseline sm:gap-3">
                    <span className="shrink-0 text-xs text-zinc-500">{formatarDataHora(e.criado_em as string, timeZone)}</span>
                    <span>
                      <strong>{EVENTOS_TAREFA[e.tipo as string] ?? (e.tipo as string)}</strong> por {nome(e.usuario_id as string | null)}
                      {e.tipo === "reatribuida" ? ` · de ${e.de_usuario_id ? nome(e.de_usuario_id as string) : "ninguém"} para ${nome(e.para_usuario_id as string | null)}` : ""}
                      {e.tipo === "status_alterado" && dados.de && dados.para ? ` · ${STATUS_TAREFA[String(dados.de)] ?? dados.de} → ${STATUS_TAREFA[String(dados.para)] ?? dados.para}` : ""}
                      {e.tipo === "vencimento_alterado" ? ` · ${formatarData(dados.de as string | null) || "—"} → ${formatarData(dados.para as string | null) || "—"}` : ""}
                      {typeof dados.motivo === "string" && dados.motivo ? <span className="block text-xs text-zinc-500">motivo: {dados.motivo}</span> : null}
                      {dados.protocolado === true ? <span className="block text-xs text-zinc-500">protocolado: prazo marcado como cumprido</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Item({ rotulo, valor, className }: { rotulo: string; valor: string | null | undefined; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{rotulo}</dt>
      <dd className="whitespace-pre-line">{valor || <span className="text-zinc-400">—</span>}</dd>
    </div>
  );
}
