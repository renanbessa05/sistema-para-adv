import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarCalendario } from "@/server/calendario";
import { listarAprovacoesPendentes } from "@/server/aprovacoes";
import { calcularPeriodos } from "@/lib/prazos/periodos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ROTULO_TIPO_PUBLICACAO } from "@/components/dominio/CaixaPublicacoes";
import { formatarData } from "@/lib/utils";

export const metadata = { title: "Hoje" };

type Prazo = { id: string; ato_descricao: string; data_final: string; data_interna: string | null; status: string; processo_id: string | null; processos: { numero_cnj_mascara: string | null } | null };
type Tarefa = { id: string; titulo: string; vencimento: string | null; status: string; prioridade: string | null };
type PubPendente = { id: string; tipo: string | null; numero_cnj: string | null; numero_processo_texto: string | null; resumo_ia: string | null; status: string; data_disponibilizacao: string | null; processos: { numero_cnj_mascara: string | null } | null };
type PrazoSugerido = { id: string; ato_descricao: string | null; data_final: string; processos: { numero_cnj_mascara: string | null } | null };

/** Linha da caixa "Decidir agora": o que é, o que fazer e para onde ir. */
type Decisao = { chave: string; etiqueta: string; tom: "info" | "alerta" | "perigo"; texto: string; detalhe: string; href: string; acao: string };

const ROTULO_OBJETO_APROVACAO: Record<string, string> = { minuta: "Peça", contrato: "Contrato", calculo: "Cálculo", mensagem_cliente: "Mensagem ao cliente", prazo: "Prazo", tarefa_reatribuicao: "Reatribuição", tarefa_conclusao: "Conclusão de tarefa" };

/** Saudação pela hora local do escritório (Cuiabá por padrão). */
function saudacaoDoDia(hora: number): string {
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
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
    decisoes.push({ chave: `prazo-${s.id}`, etiqueta: "Prazo sugerido", tom: s.data_final <= periodos.amanha ? "perigo" : "alerta", texto: s.ato_descricao ?? "ato a praticar", detalhe: `${s.processos?.numero_cnj_mascara ?? "sem processo"} · data final ${formatarData(s.data_final)}`, href: `/prazos/${s.id}`, acao: "Confirmar" });
  }
  for (const p of (pubsPendentes ?? []) as unknown as PubPendente[]) {
    const semProcesso = p.status === "sem_processo" || p.status === "classificada";
    decisoes.push({
      chave: `pub-${p.id}`,
      etiqueta: "Publicação",
      tom: semProcesso ? "alerta" : "info",
      texto: `${p.tipo ? (ROTULO_TIPO_PUBLICACAO[p.tipo] ?? p.tipo) : "Publicação"}${p.resumo_ia ? `: ${p.resumo_ia.slice(0, 110)}${p.resumo_ia.length > 110 ? "…" : ""}` : ""}`,
      detalhe: `${p.processos?.numero_cnj_mascara ?? p.numero_processo_texto ?? p.numero_cnj ?? "sem número"}${p.data_disponibilizacao ? ` · ${formatarData(p.data_disponibilizacao)}` : ""}`,
      href: `/publicacoes/${p.id}`,
      acao: semProcesso ? "Vincular ou ignorar" : p.status === "sem_prazo" ? "Marcar tratada" : "Tem prazo?",
    });
  }
  for (const a of aprovacoes) {
    decisoes.push({ chave: `apr-${a.id}`, etiqueta: "Aprovação", tom: "info", texto: `${ROTULO_OBJETO_APROVACAO[a.objeto_tipo] ?? a.objeto_tipo} aguardando sua decisão`, detalhe: a.prazo_resposta_em ? `responder até ${formatarData(a.prazo_resposta_em.slice(0, 10))}` : "sem prazo de resposta", href: "/aprovacoes", acao: "Decidir" });
  }

  const primeiroNome = sessao.nome.trim().split(/\s+/)[0] ?? sessao.nome;
  const hora = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(new Date()));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ouro-500">
            {saudacaoDoDia(hora)}, {primeiroNome}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-marca-900">{formatarData(periodos.hoje)}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Semana até {formatarData(periodos.semanaFim)} · próximo dia útil {formatarData(periodos.amanha)}
          </p>
        </div>
        {sessao.papel === "socio" ? (
          <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-1 text-sm shadow-sm">
            <Link href="/hoje" className={`rounded-md px-3 py-1.5 ${!escritorioInteiro ? "bg-marca-600 text-white shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}>
              Meu dia
            </Link>
            <Link href="/hoje?visao=escritorio" className={`rounded-md px-3 py-1.5 ${escritorioInteiro ? "bg-marca-600 text-white shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}>
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

      <Card className={decisoes.length ? "border-ouro-500/40" : undefined}>
        <CardHeader>
          <CardTitle>Decidir agora</CardTitle>
          <CardDescription>{decisoes.length ? "O que está esperando uma decisão sua. Cada linha leva direto para a tela certa; o sistema segue para o passo seguinte sozinho." : "Nada esperando decisão. Publicações novas aparecem aqui assim que a IA as classifica."}</CardDescription>
        </CardHeader>
        {decisoes.length ? (
          <CardContent className="p-0">
            <ul className="divide-y divide-zinc-100">
              {decisoes.map((d) => (
                <li key={d.chave} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <Badge tom={d.tom === "perigo" ? "perigo" : d.tom === "alerta" ? "alerta" : "info"} className="w-32 shrink-0 justify-center">
                    {d.etiqueta}
                  </Badge>
                  <span className="min-w-0 flex-1">
                    <Link href={d.href} className="block truncate font-medium text-zinc-800 hover:text-marca-600 hover:underline">
                      {d.texto}
                    </Link>
                    <span className="block text-xs text-zinc-500">{d.detalhe}</span>
                  </span>
                  <Link href={d.href} className="inline-flex h-8 shrink-0 items-center rounded-md bg-marca-600 px-3 text-xs font-medium text-white shadow-sm hover:bg-marca-700">
                    {d.acao} →
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        ) : null}
      </Card>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Indicador titulo="Publicações a tratar" valor={publicacoesATratar ?? 0} href="/publicacoes" gravidade={publicacoesATratar ? "alerta" : "ok"} legenda={publicacoesATratar ? "aguardando tratamento" : "tudo em dia"} />
        <Indicador titulo="Prazos a confirmar" valor={prazosSugeridos ?? 0} href="/prazos?status=sugerido" gravidade={prazosSugeridos ? "info" : "ok"} legenda={prazosSugeridos ? "sugeridos pelo sistema" : "nenhum sugerido"} />
        <Indicador titulo="Prazos hoje ou vencidos" valor={hoje.length} href="/prazos?periodo=hoje" gravidade={hoje.length ? "perigo" : "ok"} legenda={hoje.length ? "pedem atenção agora" : "nada vencendo hoje"} />
        <Indicador titulo="Tarefas atrasadas" valor={atrasadas.length} href="/tarefas" gravidade={atrasadas.length ? "perigo" : "ok"} legenda={atrasadas.length ? "passaram do vencimento" : "nenhuma atrasada"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Prazos da semana</CardTitle>
            <CardDescription>Data fatal e data interna. Vencidos ficam em vermelho até alguém marcar como cumprido.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <ListaPrazos titulo="Hoje e vencidos" itens={hoje} tom="perigo" vazio="Nenhum prazo para hoje." />
            <ListaPrazos titulo={`Próximo dia útil · ${formatarData(periodos.amanha)}`} itens={amanha} tom="alerta" vazio="Nada para o próximo dia útil." />
            <ListaPrazos titulo="Resto da semana" itens={semana} tom="info" vazio="Nenhum outro prazo nesta semana." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tarefas abertas</CardTitle>
            <CardDescription>{escritorioInteiro ? "Todas as tarefas abertas do escritório." : "Suas tarefas, as de vencimento mais próximo primeiro."}</CardDescription>
          </CardHeader>
          <CardContent>
            {listaTarefas.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-500">Nenhuma tarefa aberta.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {listaTarefas.slice(0, 15).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <Link href={`/tarefas/${t.id}`} className="font-medium text-zinc-800 hover:text-marca-600 hover:underline">
                      {t.titulo}
                    </Link>
                    <span className="flex shrink-0 items-center gap-2">
                      {t.vencimento && t.vencimento < periodos.hoje ? <Badge tom="perigo">atrasada</Badge> : null}
                      <span className="text-xs text-zinc-500">{t.vencimento ? formatarData(t.vencimento) : "sem prazo"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const GRAVIDADE = {
  ok: { faixa: "bg-emerald-500", numero: "text-zinc-900", seta: "text-zinc-400" },
  info: { faixa: "bg-marca-500", numero: "text-marca-900", seta: "text-marca-300" },
  alerta: { faixa: "bg-ouro-500", numero: "text-ouro-500", seta: "text-ouro-500" },
  perigo: { faixa: "bg-red-600", numero: "text-red-700", seta: "text-red-400" },
} as const;

function Indicador({ titulo, valor, href, gravidade, legenda }: { titulo: string; valor: number; href: string; gravidade: keyof typeof GRAVIDADE; legenda: string }) {
  const g = GRAVIDADE[gravidade];
  return (
    <Link href={href} className="group block focus-visible:outline-none">
      <Card className="relative h-full overflow-hidden transition-shadow group-hover:shadow-md">
        <span className={`absolute inset-x-0 top-0 h-1 ${g.faixa}`} aria-hidden="true" />
        <CardContent className="flex flex-col gap-1 p-5">
          <p className="text-sm font-medium text-zinc-600">{titulo}</p>
          <p className={`text-3xl font-semibold tabular-nums sm:text-4xl ${g.numero}`}>{valor}</p>
          <p className="mt-1 flex items-center justify-between text-xs text-zinc-500">
            {legenda}
            <span className={`hidden transition-transform group-hover:translate-x-0.5 sm:inline ${g.seta}`} aria-hidden="true">
              →
            </span>
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

function ListaPrazos({ titulo, itens, tom, vazio }: { titulo: string; itens: Prazo[]; tom: "perigo" | "alerta" | "info"; vazio: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{titulo}</p>
      {itens.length === 0 ? (
        <p className="text-sm text-zinc-400">{vazio}</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {itens.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <Link href={`/prazos/${p.id}`} className="min-w-0 truncate font-medium text-zinc-800 hover:text-marca-600 hover:underline">
                {p.ato_descricao} <span className="font-normal text-zinc-500">· {p.processos?.numero_cnj_mascara ?? "sem processo"}</span>
              </Link>
              <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                {p.status === "vencido" ? <Badge tom="perigo">vencido</Badge> : <Badge tom={tom}>{formatarData(p.data_final)}</Badge>}
                {p.data_interna ? <span className="text-xs text-zinc-500">interna {formatarData(p.data_interna)}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
