import Link from "next/link";
import { Plus } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarCalendario } from "@/server/calendario";
import { listarMembros, mapaNomes } from "@/server/publicacoes";
import { calcularPeriodos } from "@/lib/prazos/periodos";
import { cn, formatarData } from "@/lib/utils";
import { BadgeDataFinal, DiaAgenda, ROTULO_STATUS_PRAZO, TOM_STATUS_PRAZO, urgenciaPrazo } from "@/components/dominio/CartaoPrazo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, Vazio } from "@/components/ui/alert";
import { Button, classesBotao } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Abas, abaAtual } from "@/components/dominio/Abas";
import { listarAudiencias } from "@/server/audiencias";
import { horaLocal } from "@/lib/audiencias/datas";

export const metadata = { title: "Prazos" };
export const dynamic = "force-dynamic";

type Query = Record<string, string | undefined>;

type Linha = {
  id: string;
  ato_descricao: string | null;
  data_final: string;
  data_interna: string | null;
  status: string;
  responsavel_id: string | null;
  processo_id: string;
  calendario_incompleto: boolean;
  quantidade: number | null;
  multiplicador: number;
  processos: { id: string; numero_cnj_mascara: string | null } | null;
};

const FILTROS_STATUS: Record<string, { rotulo: string; valores: string[] | null }> = {
  pendentes: { rotulo: "Pendentes (sugeridos, confirmados, vencidos)", valores: ["sugerido", "confirmado", "prorrogado", "suspenso", "vencido"] },
  sugerido: { rotulo: "Sugeridos", valores: ["sugerido"] },
  confirmado: { rotulo: "Confirmados", valores: ["confirmado", "prorrogado", "suspenso"] },
  vencido: { rotulo: "Vencidos", valores: ["vencido"] },
  todos: { rotulo: "Todos", valores: null },
};
const PERIODOS: Record<string, string> = { "": "Qualquer data", hoje: "Hoje e vencidos", amanha: "Amanhã útil", semana: "Esta semana", mes: "Este mês" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fimDoMes(hoje: string): string {
  const [a, m] = hoje.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${hoje.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`;
}

export default async function PaginaPrazos({ searchParams }: { searchParams: Promise<Query> }) {
  const sessao = await exigirSessao();
  const q = await searchParams;
  const status = q.status && FILTROS_STATUS[q.status] ? q.status : "pendentes";
  const periodo = q.periodo && PERIODOS[q.periodo] !== undefined ? q.periodo : "";
  const responsavel = q.responsavel && UUID.test(q.responsavel) ? q.responsavel : "";
  const processo = q.processo?.trim().slice(0, 40) ?? "";
  const supabase = await criarClienteServidor();
  const ABAS = [
    { chave: "prazos", rotulo: "Prazos" },
    { chave: "audiencias", rotulo: "Audiências" },
  ];
  const aba = abaAtual(ABAS, q.aba);

  const { data: escritorio } = await supabase.from("escritorios").select("timezone, semana_inclui_proxima_segunda").eq("id", sessao.escritorioId).maybeSingle();
  const timeZone = (escritorio?.timezone as string | undefined) ?? "America/Cuiaba";
  const calendario = await carregarCalendario(supabase, { tribunalId: null, comarcaId: null });
  const periodos = calcularPeriodos(calendario, { timeZone, incluirProximaSegunda: escritorio?.semana_inclui_proxima_segunda !== false });

  const porNumero = processo && !UUID.test(processo) ? processo.replace(/\D/g, "") : "";
  const embed = porNumero ? "processos!inner(id, numero_cnj_mascara, numero_cnj)" : "processos(id, numero_cnj_mascara)";
  let consulta = supabase.from("prazos").select(`id, ato_descricao, data_final, data_interna, status, responsavel_id, processo_id, calendario_incompleto, quantidade, multiplicador, ${embed}`);
  const valores = FILTROS_STATUS[status].valores;
  if (valores) consulta = consulta.in("status", valores);
  if (periodo === "hoje") consulta = consulta.lte("data_final", periodos.hoje);
  else if (periodo === "amanha") consulta = consulta.eq("data_final", periodos.amanha);
  else if (periodo === "semana") consulta = consulta.lte("data_final", periodos.semanaFim);
  else if (periodo === "mes") consulta = consulta.lte("data_final", fimDoMes(periodos.hoje));
  if (responsavel) consulta = consulta.eq("responsavel_id", responsavel);
  if (processo && UUID.test(processo)) consulta = consulta.eq("processo_id", processo);
  else if (porNumero) consulta = consulta.ilike("processos.numero_cnj", `%${porNumero}%`);

  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);
  const [{ data: prazos, error }, membros, audiencias] = await Promise.all([
    consulta.order("data_final").order("data_interna", { nullsFirst: false }).limit(300),
    listarMembros(supabase),
    aba === "audiencias" ? listarAudiencias(supabase, inicioDoDia) : Promise.resolve([]),
  ]);
  const podeAgendar = ["socio", "advogado"].includes(sessao.papel);
  const nomes = mapaNomes(membros);
  const responsaveis = membros.filter((m) => m.usuario_id && (m.papel === "socio" || m.papel === "advogado"));
  const linhas = (prazos ?? []) as unknown as Linha[];
  const filtrosAtivos = Boolean(periodo || responsavel || processo);

  /** Mesmos filtros com outro status (chips acima da tabela). */
  const linkStatus = (novo: string) => {
    const p = new URLSearchParams();
    if (novo !== "pendentes") p.set("status", novo);
    if (periodo) p.set("periodo", periodo);
    if (responsavel) p.set("responsavel", responsavel);
    if (processo) p.set("processo", processo);
    const s = p.toString();
    return s ? `/prazos?${s}` : "/prazos";
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Prazos e agenda</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {aba === "audiencias" ? (
              "Audiências a partir de hoje. Alerta de véspera para o responsável e os sócios."
            ) : (
              <>
                Ordenados pela data final. Hoje: <span className="font-semibold text-zinc-700 tabular-nums">{formatarData(periodos.hoje)}</span> · vencido e hoje em vermelho, até 3 dias em âmbar.
              </>
            )}
          </p>
        </div>
        {aba === "audiencias" && podeAgendar ? (
          <Link href="/audiencias/nova" className={classesBotao()}>
            <Plus aria-hidden />
            Nova audiência
          </Link>
        ) : null}
      </div>

      <Abas base="/prazos" abas={ABAS} atual={aba} />

      {q.erro ? <Alert tom="perigo">{q.erro}</Alert> : null}
      {q.ok ? <Alert tom="sucesso">{q.ok}</Alert> : null}
      {error ? <Alert tom="perigo">Não foi possível listar os prazos: {error.message}</Alert> : null}

      {aba === "audiencias" ? (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {audiencias.length === 0 ? (
              <div className="p-4">
                <Vazio titulo="Nenhuma audiência a partir de hoje" descricao="Marque audiências pela tela do processo ou pelo botão acima." />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Quando</TH>
                    <TH>Tipo</TH>
                    <TH>Processo</TH>
                    <TH>Modalidade</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {audiencias.map((a) => {
                    const instante = new Date(String(a.data_hora));
                    const proc = a.processos as { numero_cnj_mascara?: string } | null;
                    const dataIso = new Intl.DateTimeFormat("sv-SE", { timeZone }).format(instante);
                    const encerrada = a.status === "realizada" || a.status === "cancelada";
                    return (
                      <TR key={a.id as string}>
                        <TD className="whitespace-nowrap">
                          <span className="flex items-center gap-3">
                            <DiaAgenda data={dataIso} urgencia={encerrada ? "encerrado" : urgenciaPrazo(dataIso, periodos.hoje, "confirmado")} className="h-10 w-10" />
                            <span className="flex flex-col leading-tight">
                              <span className="font-semibold text-zinc-950 tabular-nums">{formatarData(dataIso)}</span>
                              <span className="text-xs text-zinc-500 tabular-nums">{horaLocal(instante, timeZone)}</span>
                            </span>
                          </span>
                        </TD>
                        <TD className="capitalize">{a.tipo as string}</TD>
                        <TD className="whitespace-nowrap">
                          <Link href={`/processos/${a.processo_id as string}?aba=prazos`} className="font-mono text-xs text-zinc-700 hover:text-marca-700 hover:underline">
                            {proc?.numero_cnj_mascara ?? "sem número"}
                          </Link>
                        </TD>
                        <TD className="capitalize text-zinc-600">{a.modalidade as string}</TD>
                        <TD>
                          <Badge tom={a.status === "realizada" ? "sucesso" : a.status === "cancelada" ? "perigo" : "info"}>{a.status as string}</Badge>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {aba === "prazos" ? (
        <>
          <nav aria-label="Filtrar por status" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 whitespace-nowrap md:mx-0 md:flex-wrap md:px-0 md:whitespace-normal">
            {Object.entries(FILTROS_STATUS).map(([k, v]) => (
              <Link
                key={k}
                href={linkStatus(k)}
                aria-current={status === k ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-semibold transition-colors",
                  status === k ? "border-marca-600 bg-marca-600 text-white shadow-marca" : "border-zinc-200 bg-white text-zinc-700 shadow-xs hover:border-zinc-300 hover:bg-zinc-50",
                )}
              >
                {k === "pendentes" ? "Pendentes" : v.rotulo}
              </Link>
            ))}
          </nav>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <form method="get" action="/prazos" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.3fr_auto]">
                <input type="hidden" name="status" value={status} />
                <Campo label="Período">
                  <Select id="periodo" name="periodo" defaultValue={periodo}>
                    {Object.entries(PERIODOS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Campo>
                <Campo label="Responsável">
                  <Select id="responsavel" name="responsavel" defaultValue={responsavel}>
                    <option value="">Todos</option>
                    {responsaveis.map((m) => (
                      <option key={m.usuario_id as string} value={m.usuario_id as string}>
                        {m.nome_completo}
                      </option>
                    ))}
                  </Select>
                </Campo>
                <Campo label="Processo">
                  <Input id="processo" name="processo" placeholder="número CNJ" defaultValue={processo} className="font-mono" />
                </Campo>
                <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
                  <Button type="submit" variante="secundaria" className="flex-1 lg:flex-none">
                    Filtrar
                  </Button>
                  <Link href="/prazos" className={classesBotao({ variante: "fantasma", className: filtrosAtivos ? undefined : "text-zinc-400" })}>
                    Limpar
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {linhas.length === 0 ? (
                <div className="p-4">
                  <Vazio titulo="Nenhum prazo com estes filtros" descricao="Prazos sugeridos nascem das publicações classificadas; confirme-os para virar tarefa." />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Data final</TH>
                      <TH className="min-w-56">Ato</TH>
                      <TH>Processo</TH>
                      <TH>Status</TH>
                      <TH>Responsável</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {linhas.map((p) => {
                      const urgencia = urgenciaPrazo(p.data_final, periodos.hoje, p.status);
                      return (
                        <TR key={p.id}>
                          <TD className="whitespace-nowrap">
                            <Link href={`/prazos/${p.id}`} className="flex items-center gap-3">
                              <DiaAgenda data={p.data_final} urgencia={urgencia} className="h-10 w-10" />
                              <span className="flex flex-col items-start gap-0.5 leading-tight">
                                <BadgeDataFinal dataFinal={p.data_final} hoje={periodos.hoje} status={p.status} />
                                <span className="text-xs text-zinc-500 tabular-nums">{p.data_interna ? `interna ${formatarData(p.data_interna)}` : "sem data interna"}</span>
                              </span>
                            </Link>
                          </TD>
                          <TD>
                            <Link href={`/prazos/${p.id}`} className="block font-semibold text-zinc-950 hover:text-marca-700">
                              {p.ato_descricao ?? "ato a praticar"}
                            </Link>
                            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                              {p.quantidade ? (
                                <span className="tabular-nums">
                                  {p.quantidade} dia(s){p.multiplicador > 1 ? ` × ${p.multiplicador}` : ""}
                                </span>
                              ) : null}
                              {p.calendario_incompleto ? <Badge tom="alerta">calendário incompleto</Badge> : null}
                            </span>
                          </TD>
                          <TD className="whitespace-nowrap">
                            <Link href={`/processos/${p.processo_id}`} className="font-mono text-xs text-zinc-700 hover:text-marca-700 hover:underline">
                              {p.processos?.numero_cnj_mascara ?? "processo"}
                            </Link>
                          </TD>
                          <TD>
                            <Badge tom={TOM_STATUS_PRAZO[p.status] ?? "neutro"}>{ROTULO_STATUS_PRAZO[p.status] ?? p.status}</Badge>
                          </TD>
                          <TD className="whitespace-nowrap text-zinc-700">{p.responsavel_id ? nomes.get(p.responsavel_id) ?? "—" : <span className="text-zinc-400">sem responsável</span>}</TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
          {linhas.length >= 300 ? <p className="text-[13px] text-zinc-500">Mostrando os 300 primeiros. Refine os filtros para ver o restante.</p> : null}
        </>
      ) : null}
    </div>
  );
}
