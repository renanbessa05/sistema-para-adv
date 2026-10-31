import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, Newspaper } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarCalendario } from "@/server/calendario";
import { listarAprovacoesPendentes } from "@/server/aprovacoes";
import { calcularPeriodos } from "@/lib/prazos/periodos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ROTULO_TIPO_PUBLICACAO } from "@/components/dominio/CaixaPublicacoes";
import { DiaAgenda, type Urgencia } from "@/components/dominio/CartaoPrazo";
import { cn, formatarData } from "@/lib/utils";

export const metadata = { title: "Hoje" };

type Prazo = { id: string; ato_descricao: string; data_final: string; data_interna: string | null; status: string; processo_id: string | null; processos: { numero_cnj_mascara: string | null } | null };
type Tarefa = { id: string; titulo: string; vencimento: string | null; status: string; prioridade: string | null };
type PubPendente = { id: string; tipo: string | null; numero_cnj: string | null; numero_processo_texto: string | null; resumo_ia: string | null; status: string; data_disponibilizacao: string | null; processos: { numero_cnj_mascara: string | null } | null };
type PrazoSugerido = { id: string; ato_descricao: string | null; data_final: string; processos: { numero_cnj_mascara: string | null } | null };

/** Linha da caixa "Decidir agora": o que é, o que fazer e para onde ir. */
type Decisao = { chave: string; etiqueta: string; tipo: "prazo" | "publicacao" | "aprovacao"; tom: "info" | "alerta" | "perigo"; texto: string; detalhe: string; href: string; acao: string };

const ROTULO_OBJETO_APROVACAO: Record<string, string> = { minuta: "Peça", contrato: "Contrato", calculo: "Cálculo", mensagem_cliente: "Mensagem ao cliente", prazo: "Prazo", tarefa_reatribuicao: "Reatribuição", tarefa_conclusao: "Conclusão de tarefa" };

/** Saudação pela hora local do escritório (Cuiabá por padrão). */
function saudacaoDoDia(hora: number): string {
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "Sexta, 31 de outubro" a partir de YYYY-MM-DD, sem depender de fuso. */
function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dia = DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${dia}, ${d} de ${MESES_LONGOS[m - 1]}`;
}

export default async function PaginaHoje({ searchParams }: { searchParams: Promise<{ visao?: string }> }) {
  const sessao = await exigirSessao();
  const { visao } = await searchParams;
  const escritorioInteiro = sessao.papel === "socio" && visao === "escritorio";
  const aprova = sessao.papel === "socio" || sessao.papel === "advogado";
  const supabase = await criarClienteServidor();

  // Consultas independentes saem juntas: cada ida e volta ao Supabase custa caro daqui (região distante).
  const tarefasQuery = supabase.from("tarefas").select("id, titulo, vencimento, status, prioridade").not("status", "in", "(concluida,cancelada)").order("vencimento", { ascending: true, nullsFirst: false }).limit(50);
  const [{ data: escritorio }, calendario, { count: publicacoesATratar }, { count: prazosSugeridos }, { data: tarefas }, { data: anos }, { data: pubsPendentes }, { data: sugeridos }, aprovacoes] = await Promise.all([
    supabase.from("escritorios").select("timezone, semana_inclui_proxima_segunda").eq("id", sessao.escritorioId).maybeSingle(),
    carregarCalendario(supabase, { tribunalId: null, comarcaId: null }),
    supabase.from("publicacoes").select("id", { count: "exact", head: true }).in("status", ["nova", "classificada", "vinculada", "sem_processo", "com_prazo_sugerido"]),
    supabase.from("prazos").select("id", { count: "exact", head: true }).eq("status", "sugerido"),
    escritorioInteiro ? tarefasQuery : tarefasQuery.eq("executor_id", sessao.usuarioId),
    supabase.schema("ref").from("calendario_anos").select("ano, conferido"),
    supabase.from("publicacoes").select("id, tipo, numero_cnj, numero_processo_texto, resumo_ia, status, data_disponibilizacao, processos(numero_cnj_mascara)").in("status", ["classificada", "sem_processo", "vinculada", "sem_prazo"]).eq("cancelada", false).order("data_disponibilizacao", { ascending: true }).limit(8),
    supabase.from("prazos").select("id, ato_descricao, data_final, processos(numero_cnj_mascara)").eq("status", "sugerido").order("data_final").limit(8),
    aprova ? listarAprovacoesPendentes(supabase).catch(() => []) : Promise.resolve([]),
  ]);
  const timeZone = (escritorio?.timezone as string | undefined) ?? "America/Cuiaba";
  const periodos = calcularPeriodos(calendario, { timeZone, incluirProximaSegunda: escritorio?.semana_inclui_proxima_segunda !== false });

  const prazosQuery = supabase
    .from("prazos")
    .select("id, ato_descricao, data_final, data_interna, status, processo_id, processos(numero_cnj_mascara)")
    .in("status", ["confirmado", "prorrogado", "vencido"])
    .lte("data_final", periodos.semanaFim)
    .order("data_final");
  const { data: prazos } = escritorioInteiro ? await prazosQuery : await prazosQuery.eq("responsavel_id", sessao.usuarioId);
  const proximoAno = Number(periodos.hoje.slice(0, 4)) + 1;
  const calendarioProximoAno = (anos ?? []).some((a) => Number(a.ano) === proximoAno);

  const listaPrazos = (prazos ?? []) as unknown as Prazo[];
  const hoje = listaPrazos.filter((p) => p.data_final === periodos.hoje || p.status === "vencido");
  const amanha = listaPrazos.filter((p) => p.data_final === periodos.amanha);
  const semana = listaPrazos.filter((p) => p.data_final > periodos.amanha);
  const listaTarefas = (tarefas ?? []) as Tarefa[];
  const atrasadas = listaTarefas.filter((t) => t.vencimento && t.vencimento < periodos.hoje);

  // Caixa "Decidir agora": tudo que espera uma decisão humana, na ordem do fio (publicação → prazo → aprovação).
  const decisoes: Decisao[] = [];
  for (const s of (sugeridos ?? []) as unknown as PrazoSugerido[]) {
    const urgente = s.data_final <= periodos.amanha;
    decisoes.push({ chave: `prazo-${s.id}`, etiqueta: urgente ? "Prazo sugerido · vence logo" : "Prazo sugerido", tipo: "prazo", tom: urgente ? "perigo" : "alerta", texto: s.ato_descricao ?? "ato a praticar", detalhe: `${s.processos?.numero_cnj_mascara ?? "sem processo"} · data final ${formatarData(s.data_final)}`, href: `/prazos/${s.id}`, acao: "Confirmar prazo" });
  }
  for (const p of (pubsPendentes ?? []) as unknown as PubPendente[]) {
    const semProcesso = p.status === "sem_processo" || p.status === "classificada";
    decisoes.push({
      chave: `pub-${p.id}`,
      etiqueta: semProcesso ? "Publicação sem processo" : "Publicação",
      tipo: "publicacao",
      tom: semProcesso ? "alerta" : "info",
      texto: `${p.tipo ? (ROTULO_TIPO_PUBLICACAO[p.tipo] ?? p.tipo) : "Publicação"}${p.resumo_ia ? `: ${p.resumo_ia.slice(0, 110)}${p.resumo_ia.length > 110 ? "…" : ""}` : ""}`,
      detalhe: `${p.processos?.numero_cnj_mascara ?? p.numero_processo_texto ?? p.numero_cnj ?? "sem número"}${p.data_disponibilizacao ? ` · publicada ${formatarData(p.data_disponibilizacao)}` : ""}`,
      href: `/publicacoes/${p.id}`,
      acao: semProcesso ? "Vincular ou ignorar" : p.status === "sem_prazo" ? "Marcar tratada" : "Tem prazo?",
    });
  }
  for (const a of aprovacoes) {
    decisoes.push({ chave: `apr-${a.id}`, etiqueta: "Aprovação", tipo: "aprovacao", tom: "info", texto: `${ROTULO_OBJETO_APROVACAO[a.objeto_tipo] ?? a.objeto_tipo} aguardando sua decisão`, detalhe: a.prazo_resposta_em ? `responder até ${formatarData(a.prazo_resposta_em.slice(0, 10))}` : "sem prazo de resposta", href: "/aprovacoes", acao: "Decidir" });
  }

  const primeiroNome = sessao.nome.trim().split(/\s+/)[0] ?? sessao.nome;
  const hora = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(new Date()));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-marca-600">
            {saudacaoDoDia(hora)}, {primeiroNome}
          </p>
          <h1 className="mt-0.5 text-[26px] leading-[1.1] font-extrabold tracking-[-0.03em] text-zinc-950 sm:text-[30px]">{dataPorExtenso(periodos.hoje)}</h1>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-zinc-500">
            <Ponto>Semana até {formatarData(periodos.semanaFim).slice(0, 5)}</Ponto>
            <Ponto>Próximo dia útil {formatarData(periodos.amanha).slice(0, 5)}</Ponto>
            <Ponto>{decisoes.length === 0 ? "Nada esperando decisão" : decisoes.length === 1 ? "1 decisão esperando" : `${decisoes.length} decisões esperando`}</Ponto>
          </p>
        </div>
        {sessao.papel === "socio" ? (
          <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1 text-[13px] shadow-sm">
            <Link href="/hoje" className={cn("rounded-lg px-3.5 py-1.5 font-semibold transition-colors", !escritorioInteiro ? "bg-zinc-950 text-white" : "text-zinc-500 hover:text-zinc-900")}>
              Meu dia
            </Link>
            <Link href="/hoje?visao=escritorio" className={cn("rounded-lg px-3.5 py-1.5 font-semibold transition-colors", escritorioInteiro ? "bg-zinc-950 text-white" : "text-zinc-500 hover:text-zinc-900")}>
              Escritório
            </Link>
          </div>
        ) : null}
      </div>

      {!calendarioProximoAno && Number(periodos.hoje.slice(5, 7)) >= 11 ? (
        <Alert tom="alerta" titulo={`Calendário forense de ${proximoAno} pendente`}>
          Importe a Portaria do TJ-MT em Configurações → Calendário antes do recesso, senão os prazos do próximo ano nascem marcados como calendário incompleto.
        </Alert>
      ) : null}

      <Card className={cn("overflow-hidden", decisoes.length ? "border-ouro-300 bg-gradient-to-b from-ouro-50/70 to-white to-[120px]" : undefined)}>
        <CardHeader className={cn(decisoes.length ? "border-b border-zinc-200/80" : undefined)}>
          <CardTitle className="flex items-center gap-2.5 text-base">
            {decisoes.length ? <span className="h-2.5 w-2.5 rounded-full bg-ouro-500 ring-4 ring-ouro-100" aria-hidden /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />}
            Decidir agora
            {decisoes.length ? <span className="rounded-full bg-marca-50 px-2 text-xs font-bold leading-5 text-marca-700 tabular-nums">{decisoes.length}</span> : null}
          </CardTitle>
          <CardDescription>{decisoes.length ? "O que está esperando uma decisão sua. Cada linha leva direto para a tela certa; o sistema segue para o passo seguinte sozinho." : "Nada esperando decisão. Publicações novas aparecem aqui assim que a IA as classifica."}</CardDescription>
        </CardHeader>
        {decisoes.length ? (
          <CardContent className="p-0">
            <ul className="divide-y divide-zinc-100">
              {decisoes.map((d, i) => (
                <LinhaDecisao key={d.chave} decisao={d} principal={i === 0} />
              ))}
            </ul>
          </CardContent>
        ) : null}
      </Card>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Indicador titulo="Publicações a tratar" valor={publicacoesATratar ?? 0} href="/publicacoes" gravidade={publicacoesATratar ? "alerta" : "ok"} legenda={publicacoesATratar ? "aguardando tratamento" : "tudo em dia"} Icone={Newspaper} />
        <Indicador titulo="Prazos a confirmar" valor={prazosSugeridos ?? 0} href="/prazos?status=sugerido" gravidade={prazosSugeridos ? "info" : "ok"} legenda={prazosSugeridos ? "sugeridos pelo sistema" : "nenhum sugerido"} Icone={CalendarDays} />
        <Indicador titulo="Prazos hoje ou vencidos" valor={hoje.length} href="/prazos?periodo=hoje" gravidade={hoje.length ? "perigo" : "ok"} legenda={hoje.length ? "pedem atenção agora" : "nada vencendo hoje"} Icone={AlertTriangle} />
        <Indicador titulo="Tarefas atrasadas" valor={atrasadas.length} href="/tarefas" gravidade={atrasadas.length ? "perigo" : "ok"} legenda={atrasadas.length ? "passaram do vencimento" : "nenhuma atrasada"} Icone={ClipboardCheck} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Prazos da semana</CardTitle>
              <CardDescription className="mt-1">Data fatal e data interna. Vencidos ficam em vermelho até alguém marcar como cumprido.</CardDescription>
            </div>
            <Link href="/prazos" className="shrink-0 text-[13px] font-semibold text-marca-600 hover:underline">
              Ver todos
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ListaPrazos titulo="Hoje e vencidos" itens={hoje} hojeIso={periodos.hoje} vazio="Nenhum prazo para hoje." />
            <ListaPrazos titulo={`Próximo dia útil · ${formatarData(periodos.amanha)}`} itens={amanha} hojeIso={periodos.hoje} vazio="Nada para o próximo dia útil." />
            <ListaPrazos titulo="Resto da semana" itens={semana} hojeIso={periodos.hoje} vazio="Nenhum outro prazo nesta semana." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Tarefas abertas</CardTitle>
              <CardDescription className="mt-1">{escritorioInteiro ? "Todas as tarefas abertas do escritório." : "Suas tarefas, as de vencimento mais próximo primeiro."}</CardDescription>
            </div>
            <Link href="/tarefas" className="shrink-0 text-[13px] font-semibold text-marca-600 hover:underline">
              Ver quadro
            </Link>
          </CardHeader>
          <CardContent>
            {listaTarefas.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">Nenhuma tarefa aberta.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {listaTarefas.slice(0, 15).map((t) => {
                  const atrasada = Boolean(t.vencimento && t.vencimento < periodos.hoje);
                  const ehHoje = t.vencimento === periodos.hoje;
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className={cn("h-[18px] w-[18px] shrink-0 rounded-lg border-[1.5px]", atrasada ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white")} aria-hidden />
                      <Link href={`/tarefas/${t.id}`} className="min-w-0 flex-1 truncate font-semibold text-zinc-900 hover:text-marca-700">
                        {t.titulo}
                      </Link>
                      {atrasada ? <Badge tom="perigo">atrasada</Badge> : ehHoje ? <Badge tom="alerta">hoje</Badge> : <Badge tom="neutro">{t.vencimento ? formatarData(t.vencimento).slice(0, 5) : "sem prazo"}</Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Ponto({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" aria-hidden />
      {children}
    </span>
  );
}

const ICONE_DECISAO = { prazo: CalendarDays, publicacao: Newspaper, aprovacao: ClipboardCheck } as const;
const COR_DECISAO = {
  perigo: { icone: "bg-red-50 text-red-600", etiqueta: "text-red-700" },
  alerta: { icone: "bg-ouro-100 text-ouro-600", etiqueta: "text-ouro-700" },
  info: { icone: "bg-marca-50 text-marca-600", etiqueta: "text-marca-700" },
} as const;

function LinhaDecisao({ decisao: d, principal }: { decisao: Decisao; principal: boolean }) {
  const Icone = ICONE_DECISAO[d.tipo];
  const cor = COR_DECISAO[d.tom];
  return (
    <li className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 px-4 py-3 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:px-5">
      <span className={cn("grid h-10 w-10 place-items-center rounded-xl", cor.icone)} aria-hidden>
        <Icone className="h-[19px] w-[19px]" />
      </span>
      <span className="min-w-0">
        <span className={cn("block text-[11px] font-bold tracking-[0.06em] uppercase", cor.etiqueta)}>{d.etiqueta}</span>
        <Link href={d.href} className="block truncate text-[14px] font-semibold text-zinc-950 hover:text-marca-700">
          {d.texto}
        </Link>
        <span className="block text-xs text-zinc-500 tabular-nums">{d.detalhe}</span>
      </span>
      <Link href={d.href} className={cn("col-start-2 inline-flex h-8 w-fit items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold whitespace-nowrap transition-colors sm:col-start-3", principal ? "bg-marca-600 text-white shadow-marca hover:bg-marca-700" : "border border-zinc-200 bg-white text-zinc-800 shadow-xs hover:border-zinc-300 hover:bg-zinc-50")}>
        {d.acao}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </li>
  );
}

const GRAVIDADE = {
  ok: { icone: "bg-emerald-50 text-emerald-600", numero: "text-zinc-950" },
  info: { icone: "bg-marca-50 text-marca-600", numero: "text-zinc-950" },
  alerta: { icone: "bg-ouro-100 text-ouro-600", numero: "text-ouro-700" },
  perigo: { icone: "bg-red-50 text-red-600", numero: "text-red-600" },
} as const;

function Indicador({ titulo, valor, href, gravidade, legenda, Icone }: { titulo: string; valor: number; href: string; gravidade: keyof typeof GRAVIDADE; legenda: string; Icone: React.ComponentType<{ className?: string }> }) {
  const g = GRAVIDADE[gravidade];
  return (
    <Link href={href} className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-500/40">
      <Card className="relative h-full transition-[box-shadow,border-color] group-hover:border-zinc-300 group-hover:shadow-md">
        <CardContent className="flex flex-col gap-2.5 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12.5px] leading-snug font-semibold text-zinc-500">{titulo}</p>
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", g.icone)} aria-hidden>
              <Icone className="h-4 w-4" />
            </span>
          </div>
          <p className={cn("text-[32px] leading-none font-extrabold tracking-[-0.03em] tabular-nums sm:text-[36px]", g.numero)}>{valor}</p>
          <p className="flex items-center justify-between text-xs text-zinc-500">
            {legenda}
            <span className="hidden h-6 w-6 place-items-center rounded-full text-zinc-400 ring-1 ring-zinc-200 transition-transform group-hover:translate-x-0.5 group-hover:text-marca-600 sm:grid" aria-hidden>
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

function urgenciaLinha(p: Prazo, hoje: string): Urgencia {
  if (p.status === "vencido" || p.data_final < hoje) return "vencido";
  if (p.data_final === hoje) return "hoje";
  const [a1, m1, d1] = hoje.split("-").map(Number);
  const [a2, m2, d2] = p.data_final.split("-").map(Number);
  const dias = Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
  return dias <= 3 ? "proximo" : "normal";
}

function ListaPrazos({ titulo, itens, hojeIso, vazio }: { titulo: string; itens: Prazo[]; hojeIso: string; vazio: string }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase after:h-px after:flex-1 after:bg-zinc-100">{titulo}</p>
      {itens.length === 0 ? (
        <p className="py-1 text-sm text-zinc-400">{vazio}</p>
      ) : (
        <ul className="flex flex-col">
          {itens.map((p) => {
            const u = urgenciaLinha(p, hojeIso);
            return (
              <li key={p.id} className="flex items-center gap-3 py-1.5 text-sm">
                <DiaAgenda data={p.data_final} urgencia={u} />
                <Link href={`/prazos/${p.id}`} className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-zinc-950 hover:text-marca-700">{p.ato_descricao}</span>
                  <span className="block truncate text-xs text-zinc-500 tabular-nums">
                    {p.processos?.numero_cnj_mascara ?? "sem processo"}
                    {p.data_interna ? ` · interna ${formatarData(p.data_interna).slice(0, 5)}` : ""}
                  </span>
                </Link>
                {p.status === "vencido" || u === "vencido" ? <Badge tom="perigo">vencido</Badge> : u === "hoje" ? <Badge tom="perigo">hoje</Badge> : u === "proximo" ? <Badge tom="alerta">{formatarData(p.data_final).slice(0, 5)}</Badge> : <Badge tom="info">{formatarData(p.data_final).slice(0, 5)}</Badge>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
