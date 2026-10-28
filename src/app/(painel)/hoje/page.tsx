import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarCalendario } from "@/server/calendario";
import { calcularPeriodos } from "@/lib/prazos/periodos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { formatarData } from "@/lib/utils";

export const metadata = { title: "Hoje" };

type Prazo = { id: string; ato_descricao: string; data_final: string; data_interna: string | null; status: string; processo_id: string | null; processos: { numero_cnj_mascara: string | null } | null };
type Tarefa = { id: string; titulo: string; vencimento: string | null; status: string; prioridade: string | null };

export default async function PaginaHoje({ searchParams }: { searchParams: Promise<{ visao?: string }> }) {
  const sessao = await exigirSessao();
  const { visao } = await searchParams;
  const escritorioInteiro = sessao.papel === "socio" && visao === "escritorio";
  const supabase = await criarClienteServidor();

  const { data: escritorio } = await supabase.from("escritorios").select("timezone, semana_inclui_proxima_segunda").eq("id", sessao.escritorioId).maybeSingle();
  const timeZone = (escritorio?.timezone as string | undefined) ?? "America/Cuiaba";
  const calendario = await carregarCalendario(supabase, { tribunalId: null, comarcaId: null });
  const periodos = calcularPeriodos(calendario, { timeZone, incluirProximaSegunda: escritorio?.semana_inclui_proxima_segunda !== false });

  const prazosQuery = supabase
    .from("prazos")
    .select("id, ato_descricao, data_final, data_interna, status, processo_id, processos(numero_cnj_mascara)")
    .in("status", ["confirmado", "prorrogado", "vencido"])
    .lte("data_final", periodos.semanaFim)
    .order("data_final");
  const { data: prazos } = escritorioInteiro ? await prazosQuery : await prazosQuery.eq("responsavel_id", sessao.usuarioId);

  const { count: publicacoesATratar } = await supabase.from("publicacoes").select("id", { count: "exact", head: true }).in("status", ["nova", "classificada", "vinculada", "sem_processo", "com_prazo_sugerido"]);
  const { count: prazosSugeridos } = await supabase.from("prazos").select("id", { count: "exact", head: true }).eq("status", "sugerido");

  const tarefasQuery = supabase.from("tarefas").select("id, titulo, vencimento, status, prioridade").not("status", "in", "(concluida,cancelada)").order("vencimento", { ascending: true, nullsFirst: false }).limit(50);
  const { data: tarefas } = escritorioInteiro ? await tarefasQuery : await tarefasQuery.eq("executor_id", sessao.usuarioId);

  const { data: anos } = await supabase.schema("ref").from("calendario_anos").select("ano, conferido");
  const proximoAno = Number(periodos.hoje.slice(0, 4)) + 1;
  const calendarioProximoAno = (anos ?? []).some((a) => Number(a.ano) === proximoAno);

  const listaPrazos = (prazos ?? []) as unknown as Prazo[];
  const hoje = listaPrazos.filter((p) => p.data_final === periodos.hoje || p.status === "vencido");
  const amanha = listaPrazos.filter((p) => p.data_final === periodos.amanha);
  const semana = listaPrazos.filter((p) => p.data_final > periodos.amanha);
  const listaTarefas = (tarefas ?? []) as Tarefa[];
  const atrasadas = listaTarefas.filter((t) => t.vencimento && t.vencimento < periodos.hoje);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Hoje, {formatarData(periodos.hoje)}</h1>
          <p className="text-sm text-zinc-500">Semana até {formatarData(periodos.semanaFim)} · amanhã útil: {formatarData(periodos.amanha)}</p>
        </div>
        {sessao.papel === "socio" ? (
          <div className="flex gap-1 text-sm">
            <Link href="/hoje" className={`rounded-md px-2 py-1 ${!escritorioInteiro ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border"}`}>
              Meu dia
            </Link>
            <Link href="/hoje?visao=escritorio" className={`rounded-md px-2 py-1 ${escritorioInteiro ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border"}`}>
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao titulo="Publicações a tratar" valor={publicacoesATratar ?? 0} href="/publicacoes" tom={publicacoesATratar ? "alerta" : "neutro"} />
        <Cartao titulo="Prazos sugeridos a confirmar" valor={prazosSugeridos ?? 0} href="/prazos?status=sugerido" tom={prazosSugeridos ? "info" : "neutro"} />
        <Cartao titulo="Prazos hoje / vencidos" valor={hoje.length} href="/prazos?periodo=hoje" tom={hoje.length ? "perigo" : "neutro"} />
        <Cartao titulo="Tarefas atrasadas" valor={atrasadas.length} href="/tarefas" tom={atrasadas.length ? "perigo" : "neutro"} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Prazos</CardTitle>
            <CardDescription>Data fatal e data interna. Vencidos aparecem em vermelho até alguém marcar cumprido.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ListaPrazos titulo="Hoje e vencidos" itens={hoje} tom="perigo" />
            <ListaPrazos titulo={`Amanhã (${formatarData(periodos.amanha)})`} itens={amanha} tom="alerta" />
            <ListaPrazos titulo="Resto da semana" itens={semana} tom="info" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tarefas</CardTitle>
            <CardDescription>{escritorioInteiro ? "Todas as tarefas abertas do escritório." : "Suas tarefas abertas, as mais urgentes primeiro."}</CardDescription>
          </CardHeader>
          <CardContent>
            {listaTarefas.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhuma tarefa aberta.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {listaTarefas.slice(0, 15).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                    <Link href={`/tarefas/${t.id}`} className="hover:underline">
                      {t.titulo}
                    </Link>
                    <span className="flex items-center gap-2">
                      {t.vencimento && t.vencimento < periodos.hoje ? <Badge tom="perigo">atrasada</Badge> : null}
                      <span className="text-zinc-500">{formatarData(t.vencimento)}</span>
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

function Cartao({ titulo, valor, href, tom }: { titulo: string; valor: number; href: string; tom: "neutro" | "info" | "alerta" | "perigo" }) {
  const cores = { neutro: "", info: "border-blue-300", alerta: "border-amber-300", perigo: "border-red-300" };
  return (
    <Link href={href}>
      <Card className={`h-full transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 ${cores[tom]}`}>
        <CardContent className="p-4">
          <p className="text-sm text-zinc-500">{titulo}</p>
          <p className="text-3xl font-semibold">{valor}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function ListaPrazos({ titulo, itens, tom }: { titulo: string; itens: Prazo[]; tom: "perigo" | "alerta" | "info" }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{titulo}</p>
      {itens.length === 0 ? (
        <p className="text-sm text-zinc-400">Nenhum.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {itens.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <Link href={`/prazos/${p.id}`} className="hover:underline">
                {p.ato_descricao} <span className="text-zinc-500">· {p.processos?.numero_cnj_mascara ?? "sem processo"}</span>
              </Link>
              <span className="flex items-center gap-2 whitespace-nowrap">
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
