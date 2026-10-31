import Link from "next/link";
import { notFound } from "next/navigation";
import { Calculator, CalendarCheck2, Newspaper } from "lucide-react";
import { exigirSessao, podeConfirmarPrazo } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMembros, mapaNomes, obterTimezone } from "@/server/publicacoes";
import { cancelarPrazo, confirmarPrazo, cumprirPrazo, rejeitarPrazo, retomarPrazo, suspenderOuProrrogarPrazo } from "@/server/prazos-acoes";
import { hojeNoFuso } from "@/lib/prazos/datas";
import { cn, formatarData, formatarDataHora } from "@/lib/utils";
import { MemoriaContagem } from "@/components/dominio/MemoriaContagem";
import { BadgeDataFinal, DiaAgenda, ROTULO_CONTAGEM, ROTULO_ORIGEM_PRAZO, ROTULO_STATUS_PRAZO, TOM_STATUS_PRAZO, urgenciaPrazo } from "@/components/dominio/CartaoPrazo";
import { ROTULO_TIPO_PUBLICACAO } from "@/components/dominio/CaixaPublicacoes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Campo, GrupoCampos, Input, Select, Textarea } from "@/components/ui/input";
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
  const urgencia = urgenciaPrazo(prazo.data_final, hoje, st);
  const temAcaoSecundaria = mostrar.rejeitar || mostrar.suspenderProrrogar || mostrar.cumprir || mostrar.cancelar;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <DiaAgenda data={prazo.data_final} urgencia={urgencia} className="mt-6 hidden h-14 w-14 rounded-2xl sm:flex [&>span:first-child]:text-[20px] [&>span:last-child]:text-[10px]" />
          <div className="min-w-0">
            <p className="text-[13px] text-zinc-500">
              <Link href="/prazos" className="font-semibold text-marca-600 hover:underline">
                Prazos
              </Link>
              <span className="mx-1.5 text-zinc-300">/</span>
              detalhe
            </p>
            <h1 className="mt-1 flex flex-wrap items-center gap-2 text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">
              {prazo.ato_descricao ?? "Prazo"}
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge tom={TOM_STATUS_PRAZO[st] ?? "neutro"}>{ROTULO_STATUS_PRAZO[st] ?? st}</Badge>
                {prazo.calendario_incompleto ? <Badge tom="alerta">calendário incompleto</Badge> : null}
                {prazo.processos?.segredo_justica ? <Badge tom="perigo">segredo de justiça</Badge> : null}
              </span>
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-zinc-500">
              <Link href={`/processos/${prazo.processo_id}`} className="font-mono text-xs text-zinc-700 hover:text-marca-700 hover:underline">
                {prazo.processos?.numero_cnj_mascara ?? "processo"}
              </Link>
              <span>· {prazo.responsavel_id ? `responsável ${nomes.get(prazo.responsavel_id) ?? "—"}` : "sem responsável"}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <span className="flex items-center gap-2">
            <span className="text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase">Data final</span>
            <BadgeDataFinal dataFinal={prazo.data_final} hoje={hoje} status={st} />
          </span>
          {sessao.papel !== "estagiario" ? (
            <Link href={`/admin/divergencias?prazo=${prazo.id}`} className="text-xs font-medium text-zinc-500 underline decoration-zinc-300 underline-offset-[3px] hover:text-zinc-900">
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
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck2 className="h-4 w-4 text-marca-600" aria-hidden />
              Datas e contagem
            </CardTitle>
            <CardDescription>Do marco inicial à data final, com a data interna que vira vencimento da tarefa.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Marco rotulo="Início da contagem" valor={formatarData(prazo.data_inicio_contagem) || "—"} />
              <Marco rotulo="Data interna" valor={formatarData(prazo.data_interna) || "—"} dica="vencimento da tarefa" />
              <Marco
                rotulo="Data final"
                valor={formatarData(prazo.data_final)}
                dica={`até ${prazo.hora_limite?.slice(0, 5) ?? "23:59"} (${prazo.timezone_juizo})`}
                tom={urgencia === "vencido" || urgencia === "hoje" ? "perigo" : urgencia === "proximo" ? "alerta" : urgencia === "encerrado" ? "neutro" : "marca"}
              />
            </div>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <Item rotulo="Quantidade">
                {prazo.quantidade ? (
                  <span className="tabular-nums">
                    {prazo.quantidade} × {prazo.multiplicador} = <strong className="font-semibold">{efetiva}</strong> {ROTULO_CONTAGEM[prazo.contagem] ?? prazo.contagem}
                  </span>
                ) : (
                  "—"
                )}
                {prazo.fundamento_dobro ? <span className="block text-xs text-zinc-500">dobro: {prazo.fundamento_dobro}</span> : null}
              </Item>
              <Item rotulo="Disponibilização">{formatarData(prazo.data_disponibilizacao) || "—"}</Item>
              <Item rotulo="Publicação">{formatarData(prazo.data_publicacao) || "—"}</Item>
              <Item rotulo="Sugerida pelo sistema">{formatarData(prazo.data_sugerida_ia) || "—"}</Item>
              <Item rotulo="Confirmada">{formatarData(prazo.data_confirmada) || "—"}</Item>
              <Item rotulo="Origem">{ROTULO_ORIGEM_PRAZO[prazo.origem] ?? prazo.origem}</Item>
              <Item rotulo="Tipo">{prazo.tipo}</Item>
              <Item rotulo="Criado em">{formatarDataHora(prazo.criado_em, timeZone)}</Item>
              {prazo.confirmado_em ? <Item rotulo="Confirmado">{`${formatarDataHora(prazo.confirmado_em, timeZone)}${prazo.confirmado_por ? ` por ${nomes.get(prazo.confirmado_por) ?? "usuário"}` : ""}`}</Item> : null}
              {prazo.cumprido_em ? <Item rotulo="Cumprido">{`${formatarDataHora(prazo.cumprido_em, timeZone)}${prazo.cumprido_por ? ` por ${nomes.get(prazo.cumprido_por) ?? "usuário"}` : ""} · ${ROTULO_EVIDENCIA[prazo.cumprimento_evidencia ?? ""] ?? prazo.cumprimento_evidencia ?? ""}`}</Item> : null}
              {prazo.motivo_rejeicao ? (
                <Item rotulo="Motivo da rejeição" className="sm:col-span-2 lg:col-span-3">
                  {prazo.motivo_rejeicao}
                </Item>
              ) : null}
              {prazo.motivo_cancelamento ? (
                <Item rotulo="Motivo do cancelamento" className="sm:col-span-2 lg:col-span-3">
                  {prazo.motivo_cancelamento}
                </Item>
              ) : null}
              {prazo.observacoes ? (
                <Item rotulo="Observações" className="sm:col-span-2 lg:col-span-3">
                  <span className="whitespace-pre-line">{prazo.observacoes}</span>
                </Item>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Newspaper className="h-4 w-4 text-zinc-400" aria-hidden />
              Publicação ligada
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {prazo.publicacao_id ? (
              <div className="flex flex-col gap-2">
                <Link href={`/publicacoes/${prazo.publicacao_id}`} className="font-semibold text-zinc-950 hover:text-marca-700">
                  {prazo.publicacoes?.tipo ? ROTULO_TIPO_PUBLICACAO[prazo.publicacoes.tipo] ?? prazo.publicacoes.tipo : "Publicação"}
                  {prazo.publicacoes?.data_disponibilizacao ? <span className="font-normal text-zinc-500"> · {formatarData(prazo.publicacoes.data_disponibilizacao)}</span> : ""}
                </Link>
                {prazo.publicacoes?.resumo_ia ? <p className="leading-relaxed text-zinc-600">{prazo.publicacoes.resumo_ia}</p> : null}
              </div>
            ) : (
              <p className="text-zinc-500">Prazo sem publicação ligada (lançamento manual, audiência ou decisão).</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-zinc-400" aria-hidden />
            Memória de cálculo
          </CardTitle>
          <CardDescription>Contagem dia a dia feita pelo motor de prazos. O dia final aparece destacado; avisos pedem conferência.</CardDescription>
        </CardHeader>
        <CardContent>
          <MemoriaContagem memoria={prazo.memoria_calculo} dataFinal={prazo.data_sugerida_ia ?? prazo.data_final} />
        </CardContent>
      </Card>

      {mostrar.retomar ? (
        <Card className="border-marca-200">
          <CardHeader>
            <CardTitle>Retomar prazo</CardTitle>
            <CardDescription>O prazo suspenso volta a contar como confirmado. Exige fundamento (ato normativo ou decisão); a nova data final é opcional e não pode ser anterior à atual.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={retomarPrazo} className="flex flex-col gap-4">
              <input type="hidden" name="id" value={prazo.id} />
              <GrupoCampos>
                <Campo label="Nova data final (opcional)" dica="Vazio mantém a data atual.">
                  <Input name="nova_data" type="date" min={prazo.data_final} />
                </Campo>
                <Campo label="Fundamento">
                  <Input name="fundamento" placeholder="Ex.: fim da suspensão (Portaria TJMT nº ...), decisão de ..." required />
                </Campo>
              </GrupoCampos>
              <div className="flex justify-end">
                <Button type="submit">Retomar prazo</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {mostrar.confirmar ? (
        <Card id="confirmar" className="border-marca-200 bg-gradient-to-b from-marca-50/50 to-white to-[80px]">
          <CardHeader>
            <CardTitle>Confirmar prazo</CardTitle>
            <CardDescription>Pode trocar o ato, o multiplicador e a data final antes. Ao confirmar, a tarefa é criada para o responsável.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={confirmarPrazo} className="flex flex-col gap-4">
              <input type="hidden" name="id" value={prazo.id} />
              <GrupoCampos colunas={2}>
                <Campo label="Ato" dica="Trocar o ato recalcula a quantidade de dias.">
                  <Select name="ato_id" defaultValue={prazo.ato_id ?? ""}>
                    <option value="">{prazo.ato_descricao ? `manter: ${prazo.ato_descricao}` : "— manter —"}</option>
                    {atos.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nome} · {a.dias} {ROTULO_CONTAGEM[a.contagem] ?? a.contagem}
                      </option>
                    ))}
                  </Select>
                </Campo>
                <Campo label="Multiplicador" dica="Em dobro para Fazenda, MP, Defensoria e litisconsortes com advogados diferentes.">
                  <Select name="multiplicador" defaultValue={String(prazo.multiplicador || 1)}>
                    <option value="1">1 (simples)</option>
                    <option value="2">2 (em dobro)</option>
                  </Select>
                </Campo>
                <Campo label="Data final">
                  <Input name="data_final" type="date" defaultValue={prazo.data_final} required className="tabular-nums" />
                </Campo>
                <Campo label="Observação (opcional)">
                  <Input name="observacao" />
                </Campo>
              </GrupoCampos>
              {prazo.calendario_incompleto ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ouro-300 bg-ouro-50 px-3.5 py-3 text-sm text-ouro-700">
                  <input type="checkbox" name="reconhecer_calendario" className="mt-0.5 h-4 w-4 shrink-0 accent-marca-600" required />
                  <span>Reconheço que o calendário forense está incompleto e conferi a data final manualmente.</span>
                </label>
              ) : null}
              <div className="flex justify-end">
                <Button type="submit" tamanho="lg">
                  Confirmar prazo
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {temAcaoSecundaria ? (
        <section className="flex flex-col gap-3">
          <p className="text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase">Outras ações</p>
          <div className="grid gap-4 md:grid-cols-2">
            {mostrar.rejeitar ? (
              <Card>
                <CardHeader>
                  <CardTitle>Rejeitar sugestão</CardTitle>
                  <CardDescription>Não gera prazo, intimação de terceiro ou erro de classificação.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form action={rejeitarPrazo} className="flex flex-col gap-3">
                    <input type="hidden" name="id" value={prazo.id} />
                    <Campo label="Motivo">
                      <Textarea name="motivo" rows={2} required className="min-h-20" />
                    </Campo>
                    <Button type="submit" variante="contorno" className="self-end">
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
                  <form action={suspenderOuProrrogarPrazo} className="flex flex-col gap-3">
                    <input type="hidden" name="id" value={prazo.id} />
                    <GrupoCampos>
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
                    </GrupoCampos>
                    <Button type="submit" variante="secundaria" className="self-end">
                      Aplicar
                    </Button>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            {mostrar.cumprir ? (
              <Card className="border-emerald-200">
                <CardHeader>
                  <CardTitle>Marcar como cumprido</CardTitle>
                  <CardDescription>O ato foi praticado. A publicação de origem é marcada como tratada.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form action={cumprirPrazo} className="flex flex-col gap-3">
                    <input type="hidden" name="id" value={prazo.id} />
                    <Campo label="Evidência">
                      <Select name="evidencia" defaultValue="manual">
                        <option value="manual">Manual (protocolado)</option>
                        <option value="pje">PJe</option>
                        <option value="datajud">DataJud</option>
                        <option value="tarefa">Tarefa concluída</option>
                      </Select>
                    </Campo>
                    <Button type="submit" className="self-end">
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
                  <form action={cancelarPrazo} className="flex flex-col gap-3">
                    <input type="hidden" name="id" value={prazo.id} />
                    <Campo label="Motivo">
                      <Textarea name="motivo" rows={2} required className="min-h-20" />
                    </Campo>
                    <Button type="submit" variante="perigo" className="self-end">
                      Cancelar prazo
                    </Button>
                  </form>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
          <CardDescription>Histórico do prazo, do nascimento à decisão.</CardDescription>
        </CardHeader>
        <CardContent>
          {eventos.length === 0 ? (
            <p className="py-2 text-sm text-zinc-400">Nenhum evento.</p>
          ) : (
            <ol className="relative flex flex-col gap-3 border-l border-zinc-200 pl-4">
              {eventos.map((e) => {
                const detalhe = resumirDados(e.dados ?? {});
                return (
                  <li key={e.id} className="relative text-sm">
                    <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-white bg-marca-400 ring-1 ring-zinc-200" aria-hidden />
                    <p className="text-xs text-zinc-500 tabular-nums">
                      {formatarDataHora(e.criado_em, timeZone)} · {e.usuario_id ? nomes.get(e.usuario_id) ?? "usuário" : "sistema"}
                    </p>
                    <p className="text-zinc-800">
                      <strong className="font-semibold text-zinc-950">{e.tipo}</strong>
                      {e.para_status ? ` · ${e.de_status ? ROTULO_STATUS_PRAZO[e.de_status] ?? e.de_status : "criado"} → ${ROTULO_STATUS_PRAZO[e.para_status] ?? e.para_status}` : ""}
                    </p>
                    {detalhe ? <p className="text-[13px] text-zinc-600">{detalhe}</p> : null}
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

const TOM_MARCO = {
  neutro: "border-zinc-200 bg-zinc-50/60 text-zinc-950",
  marca: "border-marca-200 bg-marca-50/60 text-marca-900",
  alerta: "border-ouro-300 bg-ouro-50 text-ouro-700",
  perigo: "border-red-200 bg-red-50 text-red-700",
} as const;

/** Data de destaque (início, interna, final) em caixa própria, para ler de longe. */
function Marco({ rotulo, valor, dica, tom = "neutro" }: { rotulo: string; valor: string; dica?: string; tom?: keyof typeof TOM_MARCO }) {
  return (
    <div className={cn("rounded-xl border px-4 py-3", TOM_MARCO[tom])}>
      <p className="text-[11px] font-bold tracking-[0.08em] uppercase opacity-70">{rotulo}</p>
      <p className="mt-0.5 text-[22px] leading-none font-extrabold tracking-[-0.02em] tabular-nums">{valor}</p>
      {dica ? <p className="mt-1 text-xs opacity-70">{dica}</p> : null}
    </div>
  );
}
