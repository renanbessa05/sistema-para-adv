import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarCalendario } from "@/server/calendario";
import { listarMembros, mapaNomes } from "@/server/publicacoes";
import { calcularPeriodos } from "@/lib/prazos/periodos";
import { formatarData } from "@/lib/utils";
import { BadgeDataFinal, ROTULO_STATUS_PRAZO, TOM_STATUS_PRAZO } from "@/components/dominio/CartaoPrazo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, Vazio } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

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

  const [{ data: prazos, error }, membros] = await Promise.all([consulta.order("data_final").order("data_interna", { nullsFirst: false }).limit(300), listarMembros(supabase)]);
  const nomes = mapaNomes(membros);
  const responsaveis = membros.filter((m) => m.usuario_id && (m.papel === "socio" || m.papel === "advogado"));
  const linhas = (prazos ?? []) as unknown as Linha[];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Prazos</h1>
        <p className="text-sm text-zinc-500">
          Ordenados pela data final. Hoje: {formatarData(periodos.hoje)} · vencido e hoje em vermelho, até 3 dias em âmbar.
        </p>
      </div>

      {q.erro ? <Alert tom="perigo">{q.erro}</Alert> : null}
      {q.ok ? <Alert tom="sucesso">{q.ok}</Alert> : null}
      {error ? <Alert tom="perigo">Não foi possível listar os prazos: {error.message}</Alert> : null}

      <Card>
        <CardContent className="p-4">
          <form method="get" action="/prazos" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label htmlFor="status">Status</Label>
              <Select id="status" name="status" defaultValue={status}>
                {Object.entries(FILTROS_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.rotulo}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="periodo">Período</Label>
              <Select id="periodo" name="periodo" defaultValue={periodo}>
                {Object.entries(PERIODOS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="responsavel">Responsável</Label>
              <Select id="responsavel" name="responsavel" defaultValue={responsavel}>
                <option value="">Todos</option>
                {responsaveis.map((m) => (
                  <option key={m.usuario_id as string} value={m.usuario_id as string}>
                    {m.nome_completo}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="processo">Processo</Label>
              <Input id="processo" name="processo" placeholder="número CNJ" defaultValue={processo} />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" variante="secundaria">
                Filtrar
              </Button>
              <Link href="/prazos" className="text-sm text-zinc-500 hover:underline">
                Limpar
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
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
                  <TH>Data interna</TH>
                  <TH>Ato</TH>
                  <TH>Processo</TH>
                  <TH>Status</TH>
                  <TH>Responsável</TH>
                  <TH>Calendário</TH>
                </TR>
              </THead>
              <TBody>
                {linhas.map((p) => (
                  <TR key={p.id}>
                    <TD className="whitespace-nowrap">
                      <Link href={`/prazos/${p.id}`}>
                        <BadgeDataFinal dataFinal={p.data_final} hoje={periodos.hoje} status={p.status} />
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap text-zinc-500">{formatarData(p.data_interna) || "—"}</TD>
                    <TD>
                      <Link href={`/prazos/${p.id}`} className="hover:underline">
                        {p.ato_descricao ?? "ato a praticar"}
                      </Link>
                      {p.quantidade ? (
                        <span className="block text-xs text-zinc-500">
                          {p.quantidade} dia(s){p.multiplicador > 1 ? ` × ${p.multiplicador}` : ""}
                        </span>
                      ) : null}
                    </TD>
                    <TD className="whitespace-nowrap">
                      <Link href={`/processos/${p.processo_id}`} className="font-mono text-xs hover:underline">
                        {p.processos?.numero_cnj_mascara ?? "processo"}
                      </Link>
                    </TD>
                    <TD>
                      <Badge tom={TOM_STATUS_PRAZO[p.status] ?? "neutro"}>{ROTULO_STATUS_PRAZO[p.status] ?? p.status}</Badge>
                    </TD>
                    <TD className="whitespace-nowrap">{p.responsavel_id ? nomes.get(p.responsavel_id) ?? "—" : <span className="text-zinc-400">sem responsável</span>}</TD>
                    <TD>{p.calendario_incompleto ? <Badge tom="alerta">incompleto</Badge> : null}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {linhas.length >= 300 ? <p className="text-sm text-zinc-500">Mostrando os 300 primeiros. Refine os filtros para ver o restante.</p> : null}
    </div>
  );
}
