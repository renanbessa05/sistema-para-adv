import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSignature, Pencil, X } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMembros, mapaNomes, membrosComUsuario } from "@/server/equipe";
import { classificarTarefa, EVENTOS_TAREFA, permissoesTarefa, PRIORIDADES, STATUS_TAREFA, TIPOS_TAREFA } from "@/server/tarefas";
import { hojeNoFuso } from "@/lib/prazos";
import { cn, formatarData, formatarDataHora } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, classesBotao } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Campo, GrupoCampos, Input, Select, Textarea } from "@/components/ui/input";
import { alterarStatusTarefa, cancelarTarefa, concluirTarefa, editarTarefa, reatribuirTarefa } from "../actions";
import { ProximoPasso } from "@/components/dominio/ProximoPasso";

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

  const [{ data: escritorio }, membros, { data: eventos }, { data: minuta }] = await Promise.all([
    supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).maybeSingle(),
    listarMembros(supabase, sessao.escritorioId, { somenteAtivos: false }),
    supabase.from("tarefa_eventos").select("id, tipo, de_usuario_id, para_usuario_id, usuario_id, dados, criado_em").eq("tarefa_id", id).order("criado_em", { ascending: true }),
    supabase.from("minutas").select("id, titulo, status").eq("tarefa_id", id).order("criado_em", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const timeZone = (escritorio?.timezone as string | undefined) ?? "America/Cuiaba";
  const hoje = hojeNoFuso(timeZone);
  const tarefa = classificarTarefa(bruto as unknown as Tarefa, hoje);
  const nomes = mapaNomes(membros);
  const nome = (uid: string | null | undefined) => (uid ? (nomes.get(uid) ?? "membro") : "sistema");
  const pode = permissoesTarefa(sessao, tarefa);
  const modoEdicao = editar === "1" && pode.editar;
  const prazoAberto = tarefa.prazos && ["confirmado", "prorrogado", "vencido"].includes(tarefa.prazos.status);

  // Fio: tarefa de protocolar/redigir/revisar com processo pede uma peça; a peça nasce ligada a processo, prazo e tarefa.
  const tarefaAberta = !["concluida", "cancelada"].includes(tarefa.status);
  const pedePeca = ["protocolar", "redigir", "revisar"].includes(tarefa.tipo) && Boolean(tarefa.processo_id);
  const linkNovaPeca = `/minutas/nova?processo=${tarefa.processo_id}${tarefa.prazo_id ? `&prazo=${tarefa.prazo_id}` : ""}&tarefa=${id}`;
  const podeRedigir = ["socio", "advogado", "estagiario"].includes(sessao.papel);
  const extrasFio = [
    ...(tarefa.processo_id ? [{ href: `/processos/${tarefa.processo_id}?aba=prazos`, rotulo: "processo" }] : []),
    ...(tarefa.prazo_id ? [{ href: `/prazos/${tarefa.prazo_id}`, rotulo: "prazo" }] : []),
    ...(tarefa.publicacao_id ? [{ href: `/publicacoes/${tarefa.publicacao_id}`, rotulo: "publicação" }] : []),
  ];
  const vencimentoTom = tarefa.atrasada ? "text-red-600" : tarefa.vencimento === hoje ? "text-ouro-700" : "text-zinc-900";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] text-zinc-500">
            <Link href="/tarefas" className="font-semibold text-marca-600 hover:underline">
              Tarefas
            </Link>
            <span className="mx-1.5 text-zinc-300">/</span>
            detalhe
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">
            {tarefa.titulo}
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge tom={TOM_STATUS[tarefa.status] ?? "neutro"}>{STATUS_TAREFA[tarefa.status] ?? tarefa.status}</Badge>
              {tarefa.critica ? <Badge tom="perigo">crítica</Badge> : null}
              {tarefa.atrasada ? <Badge tom="alerta">atrasada</Badge> : null}
            </span>
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {TIPOS_TAREFA[tarefa.tipo] ?? tarefa.tipo} · prioridade {PRIORIDADES[tarefa.prioridade] ?? tarefa.prioridade} · origem {tarefa.origem}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tarefaAberta && podeRedigir && minuta ? (
            <Link href={`/minutas/${minuta.id as string}`} className={classesBotao()}>
              <FileSignature aria-hidden />
              Continuar peça
            </Link>
          ) : tarefaAberta && podeRedigir && pedePeca ? (
            <Link href={linkNovaPeca} className={classesBotao()}>
              <FileSignature aria-hidden />
              Redigir peça
            </Link>
          ) : null}
          {pode.editar ? (
            <Link href={modoEdicao ? `/tarefas/${id}` : `/tarefas/${id}?editar=1`} className={classesBotao({ variante: "contorno" })}>
              {modoEdicao ? <X aria-hidden /> : <Pencil aria-hidden />}
              {modoEdicao ? "Fechar edição" : "Editar"}
            </Link>
          ) : null}
        </div>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      {tarefa.status === "concluida" ? (
        <ProximoPasso concluido titulo="Tarefa concluída" descricao={tarefa.prazos ? `Prazo ligado: ${tarefa.prazos.status}.` : undefined} extras={extrasFio} />
      ) : tarefa.status === "cancelada" ? null : minuta ? (
        <ProximoPasso titulo={`Peça em andamento: ${minuta.titulo as string}`} descricao="Ao marcar a peça como protocolada, esta tarefa é concluída e o prazo ligado, cumprido." href={`/minutas/${minuta.id as string}`} rotulo="Continuar peça" extras={extrasFio} />
      ) : pedePeca && podeRedigir ? (
        <ProximoPasso tom={tarefa.atrasada ? "perigo" : "info"} titulo="Redigir a peça desta tarefa" descricao={`A minuta nasce ligada ao processo${tarefa.prazo_id ? ", ao prazo" : ""} e a esta tarefa. Protocolada, fecha tudo sozinha.${tarefa.vencimento ? ` Vencimento interno: ${formatarData(tarefa.vencimento)}.` : ""}`} href={linkNovaPeca} rotulo="Redigir peça" extras={extrasFio} />
      ) : (
        <ProximoPasso tom={tarefa.atrasada ? "perigo" : "info"} titulo="Faça a tarefa e conclua aqui" descricao={`${prazoAberto ? "Se protocolou, marque «Protocolado» ao concluir para cumprir o prazo." : "Quando terminar, use «Concluir tarefa» ao lado."}${tarefa.vencimento ? ` Vencimento interno: ${formatarData(tarefa.vencimento)}.` : ""}`} extras={extrasFio} />
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{modoEdicao ? "Editar tarefa" : "Detalhes"}</CardTitle>
            {modoEdicao ? <CardDescription>Título, vencimento, prioridade e descrição. Executor muda em «Reatribuir».</CardDescription> : null}
          </CardHeader>
          <CardContent>
            {modoEdicao ? (
              <form action={editarTarefa.bind(null, id)} className="flex flex-col gap-4">
                <GrupoCampos>
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
                    <Textarea name="descricao" defaultValue={tarefa.descricao ?? ""} rows={3} className="min-h-24" />
                  </Campo>
                </GrupoCampos>
                <div className="flex justify-end gap-2">
                  <Link href={`/tarefas/${id}`} className={classesBotao({ variante: "contorno" })}>
                    Cancelar
                  </Link>
                  <Button type="submit">Salvar</Button>
                </div>
              </form>
            ) : (
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Item rotulo="Executor">{tarefa.executor_id ? nome(tarefa.executor_id) : <span className="text-zinc-400">sem executor</span>}</Item>
                <Item rotulo="Responsável">{tarefa.responsavel_id ? nome(tarefa.responsavel_id) : "—"}</Item>
                <Item rotulo="Vencimento (data interna)">
                  <span className={cn("font-semibold tabular-nums", vencimentoTom)}>{formatarData(tarefa.vencimento) || "—"}</span>
                  {tarefa.atrasada ? <span className="ml-1.5 text-xs text-red-600">passou</span> : tarefa.vencimento === hoje ? <span className="ml-1.5 text-xs text-ouro-700">hoje</span> : null}
                </Item>
                <Item rotulo="Criada em">{`${formatarDataHora(tarefa.criado_em, timeZone)} por ${tarefa.criado_por_tipo === "usuario" ? nome(tarefa.criado_por_id) : tarefa.criado_por_tipo}`}</Item>
                {tarefa.processo_id ? (
                  <Item rotulo="Processo">
                    <Link href={`/processos/${tarefa.processo_id}`} className="font-mono text-xs text-marca-700 hover:underline">
                      {tarefa.processos?.numero_cnj_mascara ?? tarefa.processo_id}
                    </Link>
                    {tarefa.processos?.segredo_justica ? (
                      <Badge tom="perigo" className="ml-2">
                        sigiloso
                      </Badge>
                    ) : null}
                  </Item>
                ) : null}
                {tarefa.prazo_id && tarefa.prazos ? (
                  <Item rotulo="Prazo ligado">
                    <Link href={`/prazos/${tarefa.prazo_id}`} className="font-semibold text-zinc-950 hover:text-marca-700">
                      {tarefa.prazos.ato_descricao ?? "Prazo"} · fatal <span className="tabular-nums">{formatarData(tarefa.prazos.data_final)}</span>
                    </Link>{" "}
                    <Badge tom={tarefa.prazos.status === "vencido" ? "perigo" : "contorno"}>{tarefa.prazos.status}</Badge>
                  </Item>
                ) : null}
                {tarefa.publicacao_id ? (
                  <Item rotulo="Publicação">
                    <Link href={`/publicacoes/${tarefa.publicacao_id}`} className="font-medium text-marca-700 hover:underline">
                      ver publicação
                    </Link>
                  </Item>
                ) : null}
                {tarefa.descricao ? (
                  <Item rotulo="Descrição" className="sm:col-span-2">
                    <span className="block max-w-prose leading-relaxed whitespace-pre-line">{tarefa.descricao}</span>
                  </Item>
                ) : null}
                {tarefa.concluida_em ? <Item rotulo="Concluída">{`${formatarDataHora(tarefa.concluida_em, timeZone)} por ${nome(tarefa.concluida_por)}`}</Item> : null}
                {tarefa.cancelada_motivo ? <Item rotulo="Motivo do cancelamento">{tarefa.cancelada_motivo}</Item> : null}
              </dl>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className={cn(pode.mover || pode.concluir ? "border-marca-200" : undefined)}>
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
                <form action={concluirTarefa.bind(null, id)} className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                  {prazoAberto ? (
                    <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-snug text-zinc-800">
                      <input type="checkbox" name="protocolado" className="mt-0.5 h-4 w-4 shrink-0 accent-marca-600" />
                      <span>
                        Protocolado? Marcar o prazo <strong className="font-semibold">{tarefa.prazos?.ato_descricao ?? ""}</strong> como cumprido.
                      </span>
                    </label>
                  ) : null}
                  <Button type="submit" className="w-full">
                    Concluir tarefa
                  </Button>
                </form>
              ) : null}
              {pode.cancelar ? (
                <form action={cancelarTarefa.bind(null, id)} className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3">
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
                <CardDescription>Passa a tarefa para outro executor; o histórico registra de quem para quem.</CardDescription>
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
          <CardDescription>Tudo que aconteceu com a tarefa, em ordem.</CardDescription>
        </CardHeader>
        <CardContent>
          {(eventos ?? []).length === 0 ? (
            <p className="py-2 text-sm text-zinc-400">Sem eventos.</p>
          ) : (
            <ol className="relative flex flex-col gap-3 border-l border-zinc-200 pl-4">
              {(eventos ?? []).map((e) => {
                const dados = (e.dados ?? {}) as Record<string, unknown>;
                return (
                  <li key={e.id as string} className="relative text-sm">
                    <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-white bg-marca-400 ring-1 ring-zinc-200" aria-hidden />
                    <p className="text-xs text-zinc-500 tabular-nums">
                      {formatarDataHora(e.criado_em as string, timeZone)} · {nome(e.usuario_id as string | null)}
                    </p>
                    <p className="text-zinc-800">
                      <strong className="font-semibold text-zinc-950">{EVENTOS_TAREFA[e.tipo as string] ?? (e.tipo as string)}</strong>
                      {e.tipo === "reatribuida" ? ` · de ${e.de_usuario_id ? nome(e.de_usuario_id as string) : "ninguém"} para ${nome(e.para_usuario_id as string | null)}` : ""}
                      {e.tipo === "status_alterado" && dados.de && dados.para ? ` · ${STATUS_TAREFA[String(dados.de)] ?? dados.de} → ${STATUS_TAREFA[String(dados.para)] ?? dados.para}` : ""}
                      {e.tipo === "vencimento_alterado" ? ` · ${formatarData(dados.de as string | null) || "—"} → ${formatarData(dados.para as string | null) || "—"}` : ""}
                    </p>
                    {typeof dados.motivo === "string" && dados.motivo ? <p className="text-[13px] text-zinc-600">motivo: {dados.motivo}</p> : null}
                    {dados.protocolado === true ? <p className="text-[13px] text-emerald-700">protocolado: prazo marcado como cumprido</p> : null}
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Item({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase">{rotulo}</dt>
      <dd className="mt-0.5 text-sm text-zinc-900 break-words">{children}</dd>
    </div>
  );
}
