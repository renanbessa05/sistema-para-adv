import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirSessao, podeConfirmarPrazo } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMembros, mapaNomes, obterTimezone } from "@/server/publicacoes";
import { cancelarPrazo, confirmarPrazo, cumprirPrazo, rejeitarPrazo, retomarPrazo, suspenderOuProrrogarPrazo } from "@/server/prazos-acoes";
import { hojeNoFuso } from "@/lib/prazos/datas";
import { formatarData, formatarDataHora } from "@/lib/utils";
import { MemoriaContagem } from "@/components/dominio/MemoriaContagem";
import { BadgeDataFinal, ROTULO_CONTAGEM, ROTULO_ORIGEM_PRAZO, ROTULO_STATUS_PRAZO, TOM_STATUS_PRAZO } from "@/components/dominio/CartaoPrazo";
import { ROTULO_TIPO_PUBLICACAO } from "@/components/dominio/CaixaPublicacoes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select, Textarea } from "@/components/ui/input";
import { ProximoPasso } from "@/components/dominio/ProximoPasso";

export const metadata = { title: "Prazo" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUNAS =
  "id, escritorio_id, processo_id, publicacao_id, origem, tipo, contagem, ato_id, ato_descricao, quantidade, multiplicador, fundamento_dobro, data_disponibilizacao, data_publicacao, data_inicio_contagem, data_final, hora_limite, timezone_juizo, data_interna, data_sugerida_ia, data_confirmada, memoria_calculo, calendario_incompleto, calendario_reconhecido_por, status, motivo_rejeicao, confirmado_por, confirmado_em, cumprido_em, cumprido_por, cumprimento_evidencia, responsavel_id, motivo_cancelamento, observacoes, criado_por, criado_em";

type Prazo = {
  id: string;
  processo_id: string;
  publicacao_id: string | null;
  origem: string;
  tipo: string;
  contagem: string;
  ato_id: string | null;
  ato_descricao: string | null;
  quantidade: number | null;
  multiplicador: number;
  fundamento_dobro: string | null;
  data_disponibilizacao: string | null;
  data_publicacao: string | null;
  data_inicio_contagem: string | null;
  data_final: string;
  hora_limite: string;
  timezone_juizo: string;
  data_interna: string | null;
  data_sugerida_ia: string | null;
  data_confirmada: string | null;
  memoria_calculo: unknown;
  calendario_incompleto: boolean;
  calendario_reconhecido_por: string | null;
  status: string;
  motivo_rejeicao: string | null;
  confirmado_por: string | null;
  confirmado_em: string | null;
  cumprido_em: string | null;
  cumprido_por: string | null;
  cumprimento_evidencia: string | null;
  responsavel_id: string | null;
  motivo_cancelamento: string | null;
  observacoes: string | null;
  criado_por: string | null;
  criado_em: string;
  processos: { id: string; numero_cnj_mascara: string | null; responsavel_id: string | null; segredo_justica: boolean } | null;
  publicacoes: { id: string; tipo: string | null; data_disponibilizacao: string | null; resumo_ia: string | null } | null;
};

type Evento = { id: string; tipo: string; de_status: string | null; para_status: string | null; usuario_id: string | null; dados: Record<string, unknown>; criado_em: string };
type Ato = { id: string; nome: string; dias: number; contagem: string };

const ROTULO_EVIDENCIA: Record<string, string> = { tarefa: "tarefa concluída", manual: "manual", datajud: "DataJud", pje: "PJe" };

function resumirDados(dados: Record<string, unknown>): string {
  const partes: string[] = [];
  const chaves: [string, string][] = [
    ["motivo", "motivo"],
    ["fundamento", "fundamento"],
    ["observacao", "observação"],
    ["evidencia", "evidência"],
    ["data_anterior", "data anterior"],
    ["data_final", "data final"],
    ["data_interna", "data interna"],
    ["multiplicador", "multiplicador"],
  ];
  for (const [k, rotulo] of chaves) {
    const v = dados[k];
    if (v === null || v === undefined || v === "") continue;
    const texto = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatarData(v) : String(v);
    partes.push(`${rotulo}: ${texto}`);
  }
  if (dados.reconheceu_calendario === true) partes.push("reconheceu calendário incompleto");
  return partes.join(" · ");
}

export default async function PaginaPrazo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  const { id } = await params;
  const { erro, ok } = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("prazos")
    .select(`${COLUNAS}, processos(id, numero_cnj_mascara, responsavel_id, segredo_justica), publicacoes(id, tipo, data_disponibilizacao, resumo_ia)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar prazo: ${error.message}`);
  if (!data) notFound();
  const prazo = data as unknown as Prazo;

  const [{ data: eventosBrutos }, { data: atosBrutos }, membros, timeZone, { data: tarefaLigada }] = await Promise.all([
    supabase.from("prazos_eventos").select("id, tipo, de_status, para_status, usuario_id, dados, criado_em").eq("prazo_id", id).order("criado_em"),
    supabase.from("atos_prazo").select("id, nome, dias, contagem").eq("ativo", true).order("nome"),
    listarMembros(supabase),
    obterTimezone(supabase, sessao.escritorioId),
    supabase.from("tarefas").select("id, titulo, status").eq("prazo_id", id).order("criado_em", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const eventos = (eventosBrutos ?? []) as unknown as Evento[];
  const atos = (atosBrutos ?? []) as Ato[];
  const nomes = mapaNomes(membros);
  const hoje = hojeNoFuso(timeZone);

  // Botões por papel e estado; a RPC confere se é responsável/colaborador/sócio.
  const pode = podeConfirmarPrazo(sessao.papel);
  const st = prazo.status;
  const mostrar = {
    confirmar: pode && st === "sugerido",
    retomar: pode && st === "suspenso",
    rejeitar: pode && st === "sugerido",
    suspenderProrrogar: pode && ["confirmado", "suspenso", "prorrogado"].includes(st),
    cumprir: pode && ["confirmado", "prorrogado", "vencido"].includes(st),
    cancelar: pode && ["confirmado", "prorrogado", "vencido"].includes(st),
  };
  const efetiva = prazo.quantidade ? prazo.quantidade * (prazo.multiplicador || 1) : null;
  const datasDiferem = prazo.data_sugerida_ia && prazo.data_confirmada && prazo.data_sugerida_ia !== prazo.data_confirmada;
  const extrasFio = [
    { href: `/processos/${prazo.processo_id}?aba=prazos`, rotulo: "processo" },
    ...(prazo.publicacao_id ? [{ href: `/publicacoes/${prazo.publicacao_id}`, rotulo: "publicação" }] : []),
    ...(tarefaLigada ? [{ href: `/tarefas/${tarefaLigada.id as string}`, rotulo: "tarefa" }] : []),
  ];
  const tarefaAberta = Boolean(tarefaLigada) && !["concluida", "cancelada"].includes((tarefaLigada?.status as string) ?? "");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm text-zinc-500">
            <Link href="/prazos" className="hover:underline">
              Prazos
            </Link>{" "}
            / detalhe
          </p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {prazo.ato_descricao ?? "Prazo"}
            <Badge tom={TOM_STATUS_PRAZO[st] ?? "neutro"}>{ROTULO_STATUS_PRAZO[st] ?? st}</Badge>
            {prazo.calendario_incompleto ? <Badge tom="alerta">calendário incompleto</Badge> : null}
            {prazo.processos?.segredo_justica ? <Badge tom="perigo">segredo de justiça</Badge> : null}
          </h1>
          <p className="text-sm text-zinc-500">
            <Link href={`/processos/${prazo.processo_id}`} className="font-mono hover:underline">
              {prazo.processos?.numero_cnj_mascara ?? "processo"}
            </Link>
            {prazo.responsavel_id ? ` · responsável: ${nomes.get(prazo.responsavel_id) ?? "—"}` : " · sem responsável"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <BadgeDataFinal dataFinal={prazo.data_final} hoje={hoje} status={st} />
          {sessao.papel !== "estagiario" ? (
            <Link href={`/admin/divergencias?prazo=${prazo.id}`} className="text-xs text-zinc-500 hover:underline">
              Registrar divergência
            </Link>
          ) : null}
        </div>
      </div>

      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      {st === "sugerido" ? (
        <ProximoPasso tom="alerta" titulo="Confira a contagem e confirme (ou rejeite) este prazo" descricao={pode ? "Ao confirmar, a tarefa nasce para o responsável com vencimento na data interna. As ações estão no fim da página." : "A decisão cabe ao advogado responsável, colaborador advogado ou sócio."} extras={extrasFio} />
      ) : st === "confirmado" || st === "prorrogado" ? (
        tarefaLigada && tarefaAberta ? (
          <ProximoPasso titulo={`Tarefa: ${tarefaLigada.titulo as string}`} descricao="Faça a peça pela tarefa. Ao protocolar, este prazo é marcado como cumprido sozinho." href={`/tarefas/${tarefaLigada.id as string}`} rotulo="Abrir tarefa" extras={extrasFio} />
        ) : (
          <ProximoPasso titulo="Prazo confirmado" descricao={tarefaLigada ? "A tarefa ligada já foi encerrada. Marque o prazo como cumprido se o ato foi praticado." : "Nenhuma tarefa aberta ligada a este prazo. Marque como cumprido quando praticar o ato."} extras={extrasFio} />
        )
      ) : st === "vencido" ? (
        <ProximoPasso tom="perigo" titulo="Prazo vencido" descricao="Se o ato foi praticado, marque como cumprido. Se não, cancele com motivo e registre a divergência." href={tarefaLigada && tarefaAberta ? `/tarefas/${tarefaLigada.id as string}` : undefined} rotulo="Abrir tarefa" extras={extrasFio} />
      ) : st === "suspenso" ? (
        <ProximoPasso tom="alerta" titulo="Prazo suspenso" descricao="Retome quando o fundamento permitir; a tarefa ligada acompanha a nova data." extras={extrasFio} />
      ) : st === "cumprido" ? (
        <ProximoPasso concluido titulo="Prazo cumprido" descricao={`${prazo.cumprimento_evidencia ? `Evidência: ${ROTULO_EVIDENCIA[prazo.cumprimento_evidencia] ?? prazo.cumprimento_evidencia}.` : ""} A publicação de origem foi marcada como tratada.`} extras={extrasFio} />
      ) : null}

      {!pode ? <Alert tom="info">Estagiário e administrativo não confirmam, rejeitam ou cumprem prazo (Lei 8.906/94, art. 3º, §2º). Peça ao advogado responsável.</Alert> : null}
      {prazo.calendario_incompleto && st === "sugerido" ? (
        <Alert tom="alerta" titulo="Calendário forense incompleto">
          Algum ano percorrido não tem o calendário carregado ou faltou a comarca do processo. Confira os feriados antes de confirmar; a confirmação exige reconhecer este aviso.
        </Alert>
      ) : null}
      {datasDiferem ? (
        <Alert tom="info" titulo="Data ajustada na confirmação">
          Sugerida pelo sistema: {formatarData(prazo.data_sugerida_ia)} · confirmada: {formatarData(prazo.data_confirmada)}.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Datas e contagem</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Item rotulo="Disponibilização">{formatarData(prazo.data_disponibilizacao) || "—"}</Item>
              <Item rotulo="Publicação">{formatarData(prazo.data_publicacao) || "—"}</Item>
              <Item rotulo="Início da contagem">{formatarData(prazo.data_inicio_contagem) || "—"}</Item>
              <Item rotulo="Data final">
                <span className="font-semibold">{formatarData(prazo.data_final)}</span>
                <span className="block text-xs text-zinc-500">
                  até {prazo.hora_limite?.slice(0, 5) ?? "23:59"} ({prazo.timezone_juizo})
                </span>
              </Item>
              <Item rotulo="Data interna">{formatarData(prazo.data_interna) || "—"}</Item>
              <Item rotulo="Sugerida pelo sistema">{formatarData(prazo.data_sugerida_ia) || "—"}</Item>
              <Item rotulo="Confirmada">{formatarData(prazo.data_confirmada) || "—"}</Item>
              <Item rotulo="Quantidade">
                {prazo.quantidade ? `${prazo.quantidade} × ${prazo.multiplicador} = ${efetiva} ${ROTULO_CONTAGEM[prazo.contagem] ?? prazo.contagem}` : "—"}
                {prazo.fundamento_dobro ? <span className="block text-xs text-zinc-500">dobro: {prazo.fundamento_dobro}</span> : null}
              </Item>
              <Item rotulo="Origem">{ROTULO_ORIGEM_PRAZO[prazo.origem] ?? prazo.origem}</Item>
              <Item rotulo="Tipo">{prazo.tipo}</Item>
              <Item rotulo="Criado em">{formatarDataHora(prazo.criado_em, timeZone)}</Item>
              {prazo.confirmado_em ? <Item rotulo="Confirmado">{`${formatarDataHora(prazo.confirmado_em, timeZone)}${prazo.confirmado_por ? ` por ${nomes.get(prazo.confirmado_por) ?? "usuário"}` : ""}`}</Item> : null}
              {prazo.cumprido_em ? <Item rotulo="Cumprido">{`${formatarDataHora(prazo.cumprido_em, timeZone)}${prazo.cumprido_por ? ` por ${nomes.get(prazo.cumprido_por) ?? "usuário"}` : ""} · ${ROTULO_EVIDENCIA[prazo.cumprimento_evidencia ?? ""] ?? prazo.cumprimento_evidencia ?? ""}`}</Item> : null}
              {prazo.motivo_rejeicao ? <Item rotulo="Motivo da rejeição">{prazo.motivo_rejeicao}</Item> : null}
              {prazo.motivo_cancelamento ? <Item rotulo="Motivo do cancelamento">{prazo.motivo_cancelamento}</Item> : null}
              {prazo.observacoes ? (
                <div className="sm:col-span-2 lg:col-span-4">
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Observações</dt>
                  <dd>{prazo.observacoes}</dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Publicação ligada</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {prazo.publicacao_id ? (
              <div className="flex flex-col gap-1">
                <Link href={`/publicacoes/${prazo.publicacao_id}`} className="font-medium hover:underline">
                  {prazo.publicacoes?.tipo ? ROTULO_TIPO_PUBLICACAO[prazo.publicacoes.tipo] ?? prazo.publicacoes.tipo : "Publicação"}
                  {prazo.publicacoes?.data_disponibilizacao ? ` · ${formatarData(prazo.publicacoes.data_disponibilizacao)}` : ""}
                </Link>
                {prazo.publicacoes?.resumo_ia ? <p className="text-zinc-600 dark:text-zinc-400">{prazo.publicacoes.resumo_ia}</p> : null}
              </div>
            ) : (
              <p className="text-zinc-500">Prazo sem publicação ligada (lançamento manual, audiência ou decisão).</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Memória de cálculo</CardTitle>
          <CardDescription>Contagem dia a dia feita pelo motor de prazos. O dia final aparece destacado; avisos pedem conferência.</CardDescription>
        </CardHeader>
        <CardContent>
          <MemoriaContagem memoria={prazo.memoria_calculo} dataFinal={prazo.data_sugerida_ia ?? prazo.data_final} />
        </CardContent>
      </Card>

      {mostrar.retomar ? (
        <Card>
          <CardHeader>
            <CardTitle>Retomar prazo</CardTitle>
            <CardDescription>O prazo suspenso volta a contar como confirmado. Exige fundamento (ato normativo ou decisão); a nova data final é opcional e não pode ser anterior à atual.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={retomarPrazo} className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="id" value={prazo.id} />
              <Campo label="Nova data final (opcional)">
                <Input name="nova_data" type="date" min={prazo.data_final} />
              </Campo>
              <Campo label="Fundamento">
                <Input name="fundamento" placeholder="Ex.: fim da suspensão (Portaria TJMT nº ...), decisão de ..." required />
              </Campo>
              <div className="sm:col-span-2">
                <Button type="submit">Retomar prazo</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {mostrar.confirmar ? (
        <Card>
          <CardHeader>
            <CardTitle>Confirmar prazo</CardTitle>
            <CardDescription>Pode trocar o ato, o multiplicador e a data final antes. Ao confirmar, a tarefa é criada para o responsável.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={confirmarPrazo} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="id" value={prazo.id} />
              <Campo label="Ato">
                <Select name="ato_id" defaultValue={prazo.ato_id ?? ""}>
                  <option value="">{prazo.ato_descricao ? `manter: ${prazo.ato_descricao}` : "— manter —"}</option>
                  {atos.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome} · {a.dias} {ROTULO_CONTAGEM[a.contagem] ?? a.contagem}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Multiplicador">
                <Select name="multiplicador" defaultValue={String(prazo.multiplicador || 1)}>
                  <option value="1">1 (simples)</option>
                  <option value="2">2 (em dobro)</option>
                </Select>
              </Campo>
              <Campo label="Data final">
                <Input name="data_final" type="date" defaultValue={prazo.data_final} required />
              </Campo>
              <Campo label="Observação (opcional)">
                <Input name="observacao" />
              </Campo>
              {prazo.calendario_incompleto ? (
                <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
                  <input type="checkbox" name="reconhecer_calendario" className="h-4 w-4" required />
                  Reconheço que o calendário forense está incompleto e conferi a data final manualmente.
                </label>
              ) : null}
              <div className="sm:col-span-2 lg:col-span-4">
                <Button type="submit">Confirmar prazo</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {mostrar.rejeitar || mostrar.suspenderProrrogar || mostrar.cumprir || mostrar.cancelar ? (
        <div className="grid gap-4 md:grid-cols-2">
          {mostrar.rejeitar ? (
            <Card>
              <CardHeader>
                <CardTitle>Rejeitar sugestão</CardTitle>
                <CardDescription>Não gera prazo, intimação de terceiro ou erro de classificação.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={rejeitarPrazo} className="flex flex-col gap-2">
                  <input type="hidden" name="id" value={prazo.id} />
                  <Campo label="Motivo">
                    <Textarea name="motivo" rows={2} required />
                  </Campo>
                  <Button type="submit" variante="contorno" className="self-start">
                    Rejeitar
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {mostrar.suspenderProrrogar ? (
            <Card>
              <CardHeader>
                <CardTitle>{st === "suspenso" ? "Prorrogar (ou manter suspenso com nova data)" : st === "prorrogado" ? "Prorrogar de novo ou suspender" : "Suspender ou prorrogar"}</CardTitle>
                <CardDescription>Exige fundamento (ato normativo ou decisão). Prorrogar exige a nova data final, nunca anterior à atual.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={suspenderOuProrrogarPrazo} className="grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="id" value={prazo.id} />
                  <Campo label="Novo status">
                    <Select name="novo_status" defaultValue="prorrogado">
                      <option value="prorrogado">Prorrogado</option>
                      <option value="suspenso">{st === "suspenso" ? "Suspenso (manter, com nova data)" : "Suspenso"}</option>
                    </Select>
                  </Campo>
                  <Campo label="Nova data final">
                    <Input name="nova_data" type="date" min={prazo.data_final} />
                  </Campo>
                  <Campo label="Fundamento" className="sm:col-span-2">
                    <Input name="fundamento" placeholder="Ex.: Portaria TJMT nº ..., decisão de ..." required />
                  </Campo>
                  <div className="sm:col-span-2">
                    <Button type="submit" variante="secundaria">
                      Aplicar
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {mostrar.cumprir ? (
            <Card>
              <CardHeader>
                <CardTitle>Marcar como cumprido</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={cumprirPrazo} className="flex flex-col gap-2">
                  <input type="hidden" name="id" value={prazo.id} />
                  <Campo label="Evidência">
                    <Select name="evidencia" defaultValue="manual">
                      <option value="manual">Manual (protocolado)</option>
                      <option value="pje">PJe</option>
                      <option value="datajud">DataJud</option>
                      <option value="tarefa">Tarefa concluída</option>
                    </Select>
                  </Campo>
                  <Button type="submit" className="self-start">
                    Cumprido
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {mostrar.cancelar ? (
            <Card>
              <CardHeader>
                <CardTitle>Cancelar prazo</CardTitle>
                <CardDescription>Prazo não existia, processo encerrado etc.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={cancelarPrazo} className="flex flex-col gap-2">
                  <input type="hidden" name="id" value={prazo.id} />
                  <Campo label="Motivo">
                    <Textarea name="motivo" rows={2} required />
                  </Campo>
                  <Button type="submit" variante="perigo" className="self-start">
                    Cancelar prazo
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
        </CardHeader>
        <CardContent>
          {eventos.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhum evento.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {eventos.map((e) => {
                const detalhe = resumirDados(e.dados ?? {});
                return (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 border-b border-zinc-100 pb-2 last:border-0 dark:border-zinc-800">
                    <span className="whitespace-nowrap text-xs text-zinc-500">{formatarDataHora(e.criado_em, timeZone)}</span>
                    <span>
                      <strong>{e.tipo}</strong>
                      {e.para_status ? ` · ${e.de_status ? ROTULO_STATUS_PRAZO[e.de_status] ?? e.de_status : "criado"} → ${ROTULO_STATUS_PRAZO[e.para_status] ?? e.para_status}` : ""}
                    </span>
                    <span className="text-zinc-500">{e.usuario_id ? nomes.get(e.usuario_id) ?? "usuário" : "sistema"}</span>
                    {detalhe ? <span className="w-full text-zinc-600 dark:text-zinc-400">{detalhe}</span> : null}
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

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}
