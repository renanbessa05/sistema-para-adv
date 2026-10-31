import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarComarcas } from "@/server/processos";
import { formatarData, formatarDataHora } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Campo, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { NavegacaoConfiguracoes } from "../navegacao";
import { adicionarFeriado, marcarAnoConferido, removerFeriado } from "./actions";

export const metadata = { title: "Calendário forense" };
export const dynamic = "force-dynamic";

const ABRANGENCIA: Record<string, string> = { nacional: "Nacional", estadual: "Estadual", municipal: "Municipal (comarca)", forense: "Forense (TJ)", recesso: "Recesso", suspensao_ad_hoc: "Suspensão ad hoc" };

type Feriado = { id: string; tribunal_id: string | null; comarca_id: string | null; data: string; descricao: string; abrangencia: string; suspende_prazo: boolean; ato_normativo: string | null; url_fonte: string | null; conferido: boolean };

export default async function PaginaCalendario({ searchParams }: { searchParams: Promise<{ ano?: string; comarca?: string; erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  if (!["socio", "administrativo"].includes(sessao.papel)) redirect("/configuracoes");
  const params = await searchParams;
  const supabase = await criarClienteServidor();
  const [{ tribunalId, comarcas }, { data: escritorio }] = await Promise.all([listarComarcas(supabase), supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).maybeSingle()]);
  const timeZone = (escritorio?.timezone as string | undefined) ?? "America/Cuiaba";
  const anoAtual = Number(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric" }).format(new Date()));
  const ano = Number(params.ano) || anoAtual;
  const comarcaFiltro = params.comarca && /^[0-9a-f-]{36}$/i.test(params.comarca) ? params.comarca : null;

  let consulta = supabase
    .schema("ref")
    .from("feriados")
    .select("id, tribunal_id, comarca_id, data, descricao, abrangencia, suspende_prazo, ato_normativo, url_fonte, conferido")
    .gte("data", `${ano}-01-01`)
    .lte("data", `${ano}-12-31`)
    .order("data");
  consulta = tribunalId ? consulta.or(`tribunal_id.is.null,tribunal_id.eq.${tribunalId}`) : consulta.is("tribunal_id", null);
  if (comarcaFiltro) consulta = consulta.or(`comarca_id.is.null,comarca_id.eq.${comarcaFiltro}`);
  const [{ data: feriadosBrutos }, { data: anos }] = await Promise.all([consulta, tribunalId ? supabase.schema("ref").from("calendario_anos").select("ano, conferido, ato_normativo, url_fonte, observacoes, atualizado_em").eq("tribunal_id", tribunalId).order("ano") : Promise.resolve({ data: [] as Record<string, unknown>[] })]);
  const feriados = (feriadosBrutos ?? []) as Feriado[];
  const nomeComarca = new Map(comarcas.map((c) => [c.id, c.nome]));
  const registroAno = (anos ?? []).find((a) => Number(a.ano) === ano) ?? null;
  const anosDisponiveis = [...new Set([anoAtual - 1, anoAtual, anoAtual + 1, ...(anos ?? []).map((a) => Number(a.ano))])].sort();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Configurações</h1>
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes/calendario" />
      {params.erro ? <Alert tom="perigo">{params.erro}</Alert> : null}
      {params.ok ? <Alert tom="sucesso">{params.ok}</Alert> : null}
      {!tribunalId ? <Alert tom="perigo">Tribunal TJMT não encontrado em ref.tribunais: aplique a migration de dados iniciais.</Alert> : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-500">Ano:</span>
        {anosDisponiveis.map((a) => (
          <Link key={a} href={`/configuracoes/calendario?ano=${a}${comarcaFiltro ? `&comarca=${comarcaFiltro}` : ""}`} className={`rounded-md px-2 py-1 text-sm ${a === ano ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
            {a}
            {(anos ?? []).some((x) => Number(x.ano) === a && x.conferido) ? " ✓" : ""}
          </Link>
        ))}
        <form method="get" className="ml-auto flex items-center gap-2">
          <input type="hidden" name="ano" value={ano} />
          <Select name="comarca" defaultValue={comarcaFiltro ?? ""} className="w-auto" aria-label="Comarca">
            <option value="">Todas as comarcas</option>
            {comarcas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
          <Button type="submit" variante="secundaria" tamanho="sm">
            Filtrar
          </Button>
        </form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Dias sem expediente em {ano} {registroAno?.conferido ? <Badge tom="sucesso">ano conferido</Badge> : <Badge tom="alerta">ano não conferido</Badge>}
          </CardTitle>
          <CardDescription>Feriados nacionais, do TJ-MT e das comarcas. Enquanto o ano não estiver conferido contra a Portaria, os prazos nascem com aviso de calendário incompleto.</CardDescription>
        </CardHeader>
        <CardContent>
          {feriados.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhum registro para {ano}.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Data</TH>
                  <TH>Descrição</TH>
                  <TH>Abrangência</TH>
                  <TH>Suspende prazo</TH>
                  <TH>Ato normativo</TH>
                  <TH>Conferido</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {feriados.map((f) => (
                  <TR key={f.id}>
                    <TD className="whitespace-nowrap">{formatarData(f.data)}</TD>
                    <TD>{f.descricao}</TD>
                    <TD>
                      {ABRANGENCIA[f.abrangencia] ?? f.abrangencia}
                      {f.comarca_id ? <span className="block text-xs text-zinc-500">{nomeComarca.get(f.comarca_id) ?? "comarca"}</span> : null}
                    </TD>
                    <TD>{f.suspende_prazo ? "sim" : "não"}</TD>
                    <TD className="text-xs">
                      {f.url_fonte ? (
                        <a href={f.url_fonte} target="_blank" rel="noreferrer" className="underline">
                          {f.ato_normativo ?? "fonte"}
                        </a>
                      ) : (
                        f.ato_normativo ?? "—"
                      )}
                    </TD>
                    <TD>{f.conferido ? <Badge tom="sucesso">sim</Badge> : <Badge tom="alerta">não</Badge>}</TD>
                    <TD>
                      {f.tribunal_id || f.comarca_id ? (
                        <form action={removerFeriado.bind(null, f.id, String(ano))}>
                          <Button type="submit" variante="fantasma" tamanho="sm" className="text-xs text-red-700">
                            Remover
                          </Button>
                        </form>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {tribunalId ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Adicionar feriado ou suspensão</CardTitle>
              <CardDescription>Sempre com o ato normativo (portaria, provimento ou decisão) e, se possível, a URL da fonte.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={adicionarFeriado} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="tribunal_id" value={tribunalId} />
                <Campo label="Data">
                  <Input name="data" type="date" required defaultValue={`${ano}-01-01`} />
                </Campo>
                <Campo label="Abrangência">
                  <Select name="abrangencia" defaultValue="forense">
                    {Object.entries(ABRANGENCIA)
                      .filter(([v]) => v !== "nacional")
                      .map(([v, r]) => (
                        <option key={v} value={v}>
                          {r}
                        </option>
                      ))}
                  </Select>
                </Campo>
                <Campo label="Descrição" className="sm:col-span-2">
                  <Input name="descricao" required placeholder="Ex.: Aniversário de Cuiabá" />
                </Campo>
                <Campo label="Comarca (só para municipal/suspensão local)" className="sm:col-span-2">
                  <Select name="comarca_id" defaultValue="">
                    <option value="">Todo o tribunal</option>
                    {comarcas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </Select>
                </Campo>
                <Campo label="Ato normativo">
                  <Input name="ato_normativo" required placeholder="Portaria TJMT/PRES nº …" />
                </Campo>
                <Campo label="URL da fonte">
                  <Input name="url_fonte" type="url" placeholder="https://…" />
                </Campo>
                <Campo label="Suspende prazo?">
                  <Select name="suspende_prazo" defaultValue="1">
                    <option value="1">Sim</option>
                    <option value="0">Não (só sem expediente)</option>
                  </Select>
                </Campo>
                <div className="flex items-end justify-end">
                  <Button type="submit">Adicionar</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conferência do ano {ano}</CardTitle>
              <CardDescription>
                {registroAno ? `Atualizado em ${formatarDataHora(registroAno.atualizado_em as string, timeZone)}.` : "Ano ainda sem registro."} Marque como conferido só depois de bater a lista com a Portaria do TJ-MT.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={marcarAnoConferido} className="grid gap-3">
                <input type="hidden" name="tribunal_id" value={tribunalId} />
                <input type="hidden" name="ano" value={ano} />
                <Campo label="Portaria / ato de referência">
                  <Input name="ato_normativo" defaultValue={(registroAno?.ato_normativo as string | null) ?? ""} placeholder="Portaria TJMT/PRES nº …" />
                </Campo>
                <Campo label="URL da fonte">
                  <Input name="url_fonte" type="url" defaultValue={(registroAno?.url_fonte as string | null) ?? ""} />
                </Campo>
                <Campo label="Observações">
                  <Textarea name="observacoes" rows={2} defaultValue={(registroAno?.observacoes as string | null) ?? ""} />
                </Campo>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" name="conferido" defaultChecked={Boolean(registroAno?.conferido)} /> Ano conferido contra a Portaria
                </label>
                <div className="flex justify-end">
                  <Button type="submit">Salvar conferência</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
