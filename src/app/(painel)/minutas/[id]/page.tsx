import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, CheckCircle2, FileText, History, Minus, ShieldCheck, Sparkles, TriangleAlert, XCircle } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarEtapas, listarVersoes, obterMinuta, ROTULO_STATUS_MINUTA } from "@/server/minutas";
import { listarDocumentos } from "@/server/documentos";
import { ROTULO_AREA, ROTULO_TIPO_PECA, TITULO_ETAPA } from "@/lib/ia/schemas/minutas";
import type { ItemValidacao } from "@/lib/pecas/validar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select, Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/dominio/Markdown";
import { CartaoDocumentos } from "@/components/dominio/CartaoDocumentos";
import { cn, formatarDataHora } from "@/lib/utils";
import { ProximoPasso } from "@/components/dominio/ProximoPasso";
import { BotaoEnviar } from "@/components/ui/BotaoEnviar";
import { aprovarEtapaAction, arquivarMinutaAction, devolverEtapaAction, enviarAprovacaoMinutaAction, gerarEtapaAction, marcarProtocoladaAction, novaVersaoAction, pularEtapasAction, revisarVersaoAction } from "../actions";

export const metadata = { title: "Minuta" };
export const dynamic = "force-dynamic";

const SITUACAO: Record<string, { Icone: React.ComponentType<{ className?: string }>; icone: string; texto: string }> = {
  ok: { Icone: CheckCircle2, icone: "bg-emerald-50 text-emerald-600", texto: "text-zinc-900" },
  atencao: { Icone: TriangleAlert, icone: "bg-ouro-100 text-ouro-600", texto: "text-zinc-900" },
  falta: { Icone: XCircle, icone: "bg-red-50 text-red-600", texto: "text-red-700" },
  nao_aplicavel: { Icone: Minus, icone: "bg-zinc-100 text-zinc-400", texto: "text-zinc-500" },
};

const ROTULO_ETAPA_STATUS: Record<string, string> = { gerada: "gerada", aprovada: "aprovada", devolvida: "devolvida", pulada: "pulada" };

export default async function PaginaMinuta({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  const { id } = await params;
  const { erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const m = await obterMinuta(supabase, id);
  if (!m) notFound();
  const [etapas, versoes, documentos, { data: esc }, { data: processo }, { data: tarefaLigada }, { data: prazoLigado }] = await Promise.all([
    listarEtapas(supabase, id),
    listarVersoes(supabase, id),
    listarDocumentos(supabase, { processoId: m.processo_id ?? undefined, limite: 50 }).catch(() => []),
    supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).maybeSingle(),
    m.processo_id ? supabase.from("processos").select("numero_cnj_mascara").eq("id", m.processo_id).maybeSingle() : Promise.resolve({ data: null }),
    m.tarefa_id ? supabase.from("tarefas").select("id, titulo, status").eq("id", m.tarefa_id).maybeSingle() : Promise.resolve({ data: null }),
    m.prazo_id ? supabase.from("prazos").select("id, ato_descricao, data_final, status").eq("id", m.prazo_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const timeZone = (esc?.timezone as string | undefined) ?? "America/Cuiaba";
  const podeAprovar = ["socio", "advogado"].includes(sessao.papel);
  const versaoAtual = versoes.find((v) => v.id === m.versao_atual_id) ?? versoes[0] ?? null;
  const { data: revisoesData } = versaoAtual ? await supabase.from("minuta_revisoes").select("id, veredito, criticos_abertos, criado_em").eq("minuta_versao_id", versaoAtual.id).order("criado_em", { ascending: false }).limit(5) : { data: [] };
  const revisoes = (revisoesData ?? []) as { id: string; veredito: string | null; criticos_abertos: number; criado_em: string }[];
  const emAndamento = ["rascunho", "em_etapas", "devolvida", "redigida", "em_revisao_ia"].includes(m.status);
  const docsDaMinuta = documentos.filter((d) => versoes.some((v) => v.documento_id === d.id));
  const validacao = (versaoAtual?.validacao ?? {}) as { itens?: ItemValidacao[]; lacunas?: number; pronta?: boolean; laudas_estimadas?: number };
  const extrasFio = [
    ...(m.processo_id ? [{ href: `/processos/${m.processo_id}?aba=pecas`, rotulo: "processo" }] : []),
    ...(prazoLigado ? [{ href: `/prazos/${prazoLigado.id as string}`, rotulo: `prazo (${prazoLigado.status as string})` }] : []),
    ...(tarefaLigada ? [{ href: `/tarefas/${tarefaLigada.id as string}`, rotulo: `tarefa (${tarefaLigada.status as string})` }] : []),
  ];
  const passo = (() => {
    if (m.status === "protocolada") return { concluido: true, titulo: `Peça protocolada${m.protocolo_numero ? ` · ${m.protocolo_numero}` : ""}`, descricao: [tarefaLigada ? `Tarefa ${tarefaLigada.status as string}.` : null, prazoLigado ? `Prazo ${prazoLigado.status as string}.` : null].filter(Boolean).join(" ") || "Nada mais a fazer aqui." };
    if (m.status === "aprovada") return { tom: "alerta" as const, titulo: "Protocole no PJe e marque como protocolada aqui", descricao: "Baixe o .docx abaixo, protocole e registre o número. Isso conclui a tarefa e cumpre o prazo ligados." };
    if (m.status === "aguardando_aprovacao") return { titulo: "Aguardando aprovação", descricao: "Sócio ou advogado decide em Aprovações.", href: "/aprovacoes", rotulo: "Abrir Aprovações" };
    if (["redigida", "devolvida", "em_revisao_ia"].includes(m.status)) return { titulo: "Revise o texto e envie para aprovação", descricao: m.status === "devolvida" ? "A peça foi devolvida com comentários: ajuste e reenvie." : "Edite se precisar, salve a versão e use «Enviar para aprovação»." };
    if (m.modo === "C") return { titulo: `Gere e aprove a etapa ${m.etapa_atual} de 6`, descricao: "Cada etapa é gerada pela IA e aprovada por você antes da seguinte. A redação só vem na última." };
    return { titulo: "Gere a redação com a IA", descricao: m.modo === "B" ? "A IA revisa o rascunho colado e devolve a versão corrigida." : "A IA redige a peça a partir do relato e dos documentos marcados." };
  })();

  const mostraRedacao = m.modo !== "C" || m.etapa_atual === 6 || Boolean(versaoAtual);
  const podeEditar = Boolean(versaoAtual) && (emAndamento || m.status === "aprovada");
  const criticosAbertos = revisoes[0]?.criticos_abertos ?? 0;
  const resumoValidacao = validacao.itens?.reduce(
    (acc, i) => {
      acc[i.situacao] = (acc[i.situacao] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const temBarraAcoes = (Boolean(versaoAtual) && ["redigida", "devolvida", "em_revisao_ia"].includes(m.status) && podeAprovar) || m.status === "aguardando_aprovacao" || (m.status === "aprovada" && podeAprovar);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link href="/minutas" className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-500 hover:text-marca-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Peças
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2.5 text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">
            <span className="min-w-0 break-words">{m.titulo}</span>
            <Badge tom={m.status === "aprovada" || m.status === "protocolada" ? "sucesso" : m.status === "devolvida" ? "perigo" : "info"} className="translate-y-px">
              {ROTULO_STATUS_MINUTA[m.status] ?? m.status}
            </Badge>
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-zinc-500">
            <span className="font-medium text-zinc-700">{ROTULO_TIPO_PECA[m.tipo_peca]}</span>
            <span className="text-zinc-300">·</span>
            <span>{ROTULO_AREA[m.area]}</span>
            <span className="text-zinc-300">·</span>
            <span>modo {m.modo}</span>
            <span className="text-zinc-300">·</span>
            {processo?.numero_cnj_mascara ? (
              <Link href={`/processos/${m.processo_id}`} className="font-mono text-xs text-marca-700 hover:underline">
                {processo.numero_cnj_mascara as string}
              </Link>
            ) : (
              <span>caso ainda não ajuizado</span>
            )}
          </p>
        </div>
        {emAndamento ? (
          <form action={arquivarMinutaAction.bind(null, id)} className="flex items-center gap-1.5">
            <Select name="status" defaultValue="arquivada" className="h-8 w-32 text-[13px]" aria-label="Encerrar">
              <option value="arquivada">Arquivar</option>
              <option value="cancelada">Cancelar</option>
            </Select>
            <Button type="submit" variante="fantasma" tamanho="sm">
              Encerrar
            </Button>
          </form>
        ) : null}
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      {["arquivada", "cancelada"].includes(m.status) ? null : <ProximoPasso {...passo} extras={extrasFio} />}

      {/* Stepper */}
      {m.modo === "C" ? (
        <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Etapas">
          {[1, 2, 3, 4, 5, 6].map((n) => {
            const e = etapas.find((x) => x.numero === n);
            const atual = n === m.etapa_atual;
            const estado = e?.status === "aprovada" ? "aprovada" : e?.status === "pulada" ? "pulada" : e?.status === "devolvida" ? "devolvida" : e ? "gerada" : atual ? "atual" : "futura";
            const bolinha = {
              aprovada: "bg-emerald-600 text-white",
              pulada: "bg-zinc-200 text-zinc-500",
              devolvida: "bg-red-600 text-white",
              gerada: "bg-ouro-500 text-white",
              atual: "bg-marca-600 text-white shadow-marca ring-4 ring-marca-100",
              futura: "border border-zinc-200 bg-white text-zinc-400",
            }[estado];
            const legenda = e ? ROTULO_ETAPA_STATUS[e.status] ?? e.status : atual ? "atual" : "";
            return (
              <li key={n} className={cn("flex min-w-0 flex-col gap-1.5 rounded-xl border px-2.5 py-2.5 text-center", atual ? "border-marca-200 bg-marca-50/50" : "border-zinc-200 bg-white")} aria-current={atual ? "step" : undefined}>
                <span className={cn("mx-auto grid h-7 w-7 place-items-center rounded-full text-[12px] font-extrabold tabular-nums", bolinha)} aria-hidden>
                  {estado === "aprovada" ? <Check className="h-3.5 w-3.5" /> : n}
                </span>
                <span className="truncate text-[12px] leading-tight font-semibold text-zinc-900">{TITULO_ETAPA[n]}</span>
                {legenda ? <span className={cn("text-[10.5px] font-bold tracking-[0.06em] uppercase", estado === "aprovada" ? "text-emerald-700" : estado === "devolvida" ? "text-red-700" : estado === "gerada" ? "text-ouro-700" : estado === "atual" ? "text-marca-700" : "text-zinc-400")}>{legenda}</span> : <span className="text-[10.5px] text-transparent">—</span>}
              </li>
            );
          })}
        </ol>
      ) : null}

      {/* Etapas 1-5 */}
      {m.modo === "C"
        ? [1, 2, 3, 4, 5].map((n) => {
            const e = etapas.find((x) => x.numero === n);
            const atual = n === m.etapa_atual && emAndamento;
            if (!e && !atual) return null;
            return (
              <Card key={n} className={atual ? "border-marca-200" : undefined}>
                <CardHeader className="flex-row items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>
                      Etapa {n}: {TITULO_ETAPA[n]}
                    </CardTitle>
                    <CardDescription className="mt-1">{e ? `${e.status}${e.aprovada_em ? ` em ${formatarDataHora(e.aprovada_em, timeZone)}` : ""}${e.comentarios ? ` · comentário: ${e.comentarios}` : ""}` : "Ainda não gerada."}</CardDescription>
                  </div>
                  {e ? <Badge tom={e.status === "aprovada" ? "sucesso" : e.status === "devolvida" ? "perigo" : e.status === "pulada" ? "neutro" : "alerta"}>{e.status}</Badge> : atual ? <Badge tom="info">atual</Badge> : null}
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {e?.conteudo_md ? (
                    <div className="max-w-prose leading-relaxed">
                      <Markdown texto={e.conteudo_md} />
                    </div>
                  ) : null}
                  {atual ? (
                    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <form action={gerarEtapaAction.bind(null, id, n)}>
                          <BotaoEnviar variante={e ? "contorno" : "primaria"} rotuloEnviando="Gerando… pode levar uns minutos">
                            <Sparkles aria-hidden />
                            {e ? "Gerar de novo" : "Gerar com a IA"}
                          </BotaoEnviar>
                        </form>
                        {podeAprovar ? (
                          <form action={pularEtapasAction.bind(null, id)} className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                            <Select name="ate" defaultValue="6" className="h-9 w-32 text-[13px]" aria-label="Pular até">
                              {[2, 3, 4, 5, 6].filter((k) => k > n).map((k) => (
                                <option key={k} value={k}>
                                  Pular até {k}
                                </option>
                              ))}
                            </Select>
                            <Input name="motivo" placeholder="Motivo" className="h-9 w-36 text-[13px]" />
                            <Button type="submit" variante="fantasma" tamanho="sm">
                              Pular
                            </Button>
                          </form>
                        ) : null}
                      </div>
                      {e && e.status !== "aprovada" && podeAprovar ? (
                        <div className="grid gap-2 border-t border-zinc-200 pt-3 sm:grid-cols-2">
                          <form action={aprovarEtapaAction.bind(null, id, n)} className="flex flex-wrap gap-1.5">
                            <Input name="comentario" placeholder="Comentário (opcional)" className="min-w-0 flex-1" />
                            <Button type="submit">
                              <Check aria-hidden />
                              Aprovar e seguir
                            </Button>
                          </form>
                          <form action={devolverEtapaAction.bind(null, id, n)} className="flex flex-wrap gap-1.5">
                            <Input name="comentario" placeholder="O que refazer" className="min-w-0 flex-1" required />
                            <Button type="submit" variante="secundaria">
                              Devolver
                            </Button>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        : null}

      {/* Etapa 6 / redação */}
      {mostraRedacao ? (
        <>
          <Card>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-marca-600" aria-hidden />
                  {m.modo === "C" ? "Etapa 6: Redação" : m.modo === "B" ? "Revisão do rascunho" : "Redação"}
                </CardTitle>
                <CardDescription className="mt-1 tabular-nums">
                  {versaoAtual ? `Versão ${versaoAtual.numero} (${versaoAtual.autor_tipo === "ia" ? "IA" : "advogada"}) · ${formatarDataHora(versaoAtual.criado_em, timeZone)} · ${validacao.lacunas ?? 0} lacuna(s) · ~${validacao.laudas_estimadas ?? "?"} lauda(s)` : "Sem versão ainda."}
                </CardDescription>
              </div>
              {emAndamento ? (
                <form action={gerarEtapaAction.bind(null, id, 6)} className="shrink-0">
                  <BotaoEnviar variante={versaoAtual ? "contorno" : "primaria"} rotuloEnviando="Redigindo… leva uns 2 minutos, não saia da tela">
                    <Sparkles aria-hidden />
                    {versaoAtual ? "Redigir de novo com a IA" : "Redigir com a IA"}
                  </BotaoEnviar>
                </form>
              ) : null}
            </CardHeader>
            {validacao.itens?.length ? (
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase">Conferência formal</p>
                  {resumoValidacao?.ok ? <Badge tom="sucesso">{resumoValidacao.ok} ok</Badge> : null}
                  {resumoValidacao?.atencao ? <Badge tom="alerta">{resumoValidacao.atencao} atenção</Badge> : null}
                  {resumoValidacao?.falta ? <Badge tom="perigo">{resumoValidacao.falta} crítico(s)</Badge> : null}
                </div>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {validacao.itens.map((i) => {
                    const s = SITUACAO[i.situacao] ?? SITUACAO.nao_aplicavel;
                    const Icone = s.Icone;
                    return (
                      <li key={i.id} className="flex items-start gap-2.5 rounded-lg border border-zinc-100 bg-white px-3 py-2 text-sm">
                        <span className={cn("mt-px grid h-6 w-6 shrink-0 place-items-center rounded-md", s.icone)} aria-hidden>
                          <Icone className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0">
                          <span className={cn("block font-medium", s.texto)}>
                            {i.rotulo}
                            <span className="sr-only"> · {i.situacao === "nao_aplicavel" ? "n/a" : i.situacao}</span>
                          </span>
                          {i.detalhe ? <span className="block text-xs leading-snug text-zinc-500">{i.detalhe}</span> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            ) : (
              <CardContent className="pt-0" />
            )}
          </Card>

          {versaoAtual ? (
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-zinc-100">
                <CardTitle>Texto da peça</CardTitle>
                <CardDescription>Versão {versaoAtual.numero}, como vai para o .docx.</CardDescription>
              </CardHeader>
              <CardContent className="py-6 sm:px-8">
                <div className="mx-auto max-w-prose leading-relaxed">
                  <Markdown texto={versaoAtual.conteudo_md} tamanho="base" />
                </div>
              </CardContent>
              {podeEditar ? (
                <details className="group border-t border-zinc-100 bg-zinc-50/60">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-zinc-800 hover:text-marca-700 [&::-webkit-details-marker]:hidden">
                    Editar o texto (Markdown) e salvar como nova versão
                    <span className="text-xs font-medium text-zinc-500 group-open:hidden">abrir</span>
                    <span className="hidden text-xs font-medium text-zinc-500 group-open:inline">fechar</span>
                  </summary>
                  <form action={novaVersaoAction.bind(null, id)} className="flex flex-col gap-3 px-5 pb-5">
                    <Campo label="Editar o texto (Markdown) e salvar como nova versão" className="[&>span:first-child]:sr-only">
                      <Textarea name="conteudo_md" rows={16} defaultValue={versaoAtual.conteudo_md} className="font-mono text-xs leading-relaxed" />
                    </Campo>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Input name="resumo" placeholder="O que mudou (opcional)" className="w-full sm:w-72" />
                      <Button type="submit" variante="secundaria">
                        Salvar nova versão e .docx
                      </Button>
                    </div>
                  </form>
                </details>
              ) : null}
            </Card>
          ) : null}

          {docsDaMinuta.length ? <CartaoDocumentos documentos={docsDaMinuta} voltar={`/minutas/${id}`} processoId={m.processo_id ?? undefined} papel={sessao.papel} timeZone={timeZone} /> : null}

          {versaoAtual && podeEditar ? (
            <Card>
              <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className={cn("h-4 w-4", criticosAbertos > 0 ? "text-red-600" : "text-emerald-600")} aria-hidden />
                    Revisão pela IA (como o juiz e a triagem do PJe leriam)
                  </CardTitle>
                  <CardDescription className="mt-1">Crítico aberto segura o envio para aprovação até ser resolvido ou justificado no relatório.</CardDescription>
                </div>
                <form action={revisarVersaoAction.bind(null, id, versaoAtual.id)} className="shrink-0">
                  <BotaoEnviar variante="secundaria" rotuloEnviando="Revisando… pode levar uns minutos">
                    Revisar esta versão com a IA
                  </BotaoEnviar>
                </form>
              </CardHeader>
              {revisoes.length ? (
                <CardContent>
                  <ul className="divide-y divide-zinc-100">
                    {revisoes.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                        <Link href={`/revisor?rev=${r.id}`} className="min-w-0 flex-1 truncate font-semibold text-zinc-950 hover:text-marca-700">
                          {r.veredito ?? "Relatório de revisão"}
                        </Link>
                        <span className="flex items-center gap-2 text-xs whitespace-nowrap text-zinc-500 tabular-nums">
                          <Badge tom={r.criticos_abertos > 0 ? "perigo" : "sucesso"}>{r.criticos_abertos > 0 ? `${r.criticos_abertos} crítico(s)` : "sem críticos"}</Badge>
                          {formatarDataHora(r.criado_em, timeZone)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              ) : (
                <CardContent className="pt-0" />
              )}
            </Card>
          ) : null}

          {temBarraAcoes ? (
            <section aria-label="Ações" className="flex flex-col gap-3 rounded-2xl border border-marca-200 bg-gradient-to-r from-marca-50/80 to-white p-4 shadow-xs sm:p-5">
              {versaoAtual && ["redigida", "devolvida", "em_revisao_ia"].includes(m.status) && podeAprovar ? (
                <form action={enviarAprovacaoMinutaAction.bind(null, id)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <Campo label={validacao.lacunas ? `Há ${validacao.lacunas} lacuna(s): justifique para enviar mesmo assim` : "Comentário (opcional)"} className="min-w-0 flex-1">
                    <Input name="comentario" />
                  </Campo>
                  <Button type="submit" className="shrink-0">
                    Enviar para aprovação
                  </Button>
                </form>
              ) : null}
              {m.status === "aguardando_aprovacao" ? (
                <Alert tom="info">
                  Aguardando decisão em{" "}
                  <Link href="/aprovacoes" className="font-semibold underline">
                    Aprovações
                  </Link>
                  .
                </Alert>
              ) : null}
              {m.status === "aprovada" && podeAprovar ? (
                <form action={marcarProtocoladaAction.bind(null, id)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <Campo label="Número do protocolo (opcional)" className="min-w-0 flex-1 sm:max-w-sm">
                    <Input name="numero_protocolo" />
                  </Campo>
                  <Button type="submit" className="shrink-0">
                    <Check aria-hidden />
                    Marcar como protocolada
                  </Button>
                </form>
              ) : null}
            </section>
          ) : null}

          {versoes.length > 1 ? (
            <details className="group rounded-2xl border border-zinc-200 bg-white text-sm shadow-xs">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 font-semibold text-zinc-700 hover:text-marca-700 [&::-webkit-details-marker]:hidden">
                <History className="h-4 w-4 text-zinc-400" aria-hidden />
                Versões anteriores ({versoes.length - 1})
              </summary>
              <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
                {versoes.filter((v) => v.id !== versaoAtual?.id).map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-xs text-zinc-600">
                    <span className="font-mono font-semibold text-zinc-900">v{v.numero}</span>
                    <Badge tom="neutro">{v.autor_tipo}</Badge>
                    <span className="tabular-nums">{formatarDataHora(v.criado_em, timeZone)}</span>
                    {v.resumo_alteracoes ? <span className="min-w-0 flex-1 truncate text-zinc-500">{v.resumo_alteracoes}</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
