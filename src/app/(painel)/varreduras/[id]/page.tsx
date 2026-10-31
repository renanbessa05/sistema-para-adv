import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, ListChecks, Map, PenLine } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterAnalise } from "@/server/varreduras";
import { EIXOS_VARREDURA, ROTULO_AREA, ROTULO_TIPO_PECA } from "@/lib/ia/schemas/minutas";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Vazio } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Campo, GrupoCampos, Input, Select } from "@/components/ui/input";
import { Markdown } from "@/components/dominio/Markdown";
import { cn } from "@/lib/utils";
import { aprovarPontosAction, redigirDaVarreduraAction, regerarVarreduraAction } from "../actions";

export const metadata = { title: "Varredura" };
export const dynamic = "force-dynamic";

const TOM_SOLIDEZ: Record<string, "sucesso" | "alerta" | "perigo"> = { solida: "sucesso", arriscada: "alerta", inviavel: "perigo" };

function TituloSecao({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase">{children}</p>;
}

export default async function PaginaVarredura({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  const { id } = await params;
  const { erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const a = await obterAnalise(supabase, id);
  if (!a) notFound();
  const v = a.estruturado;
  const podeAprovar = ["socio", "advogado"].includes(sessao.papel);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex flex-col gap-1">
          <Link href="/minutas" className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-500 hover:text-marca-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Peças
          </Link>
          <h1 className="flex flex-wrap items-center gap-2.5 text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">
            Varredura dos autos <Badge tom={a.status === "aprovada" ? "sucesso" : "info"}>{a.status}</Badge>
          </h1>
          <p className="text-sm text-zinc-500">
            Polo: {a.parametros.polo} · objetivo: {a.parametros.objetivo}
            {a.parametros.prazo_termo_final ? ` · prazo até ${a.parametros.prazo_termo_final}` : ""}
            {a.minuta_id ? (
              <>
                {" · "}
                <Link href={`/minutas/${a.minuta_id}`} className="font-semibold text-marca-600 underline-offset-[3px] hover:underline">
                  minuta criada
                </Link>
              </>
            ) : null}
          </p>
        </div>
        {v ? (
          <form action={regerarVarreduraAction.bind(null, id)}>
            <Button type="submit" variante="contorno" tamanho="sm">
              Refazer a varredura
            </Button>
          </form>
        ) : null}
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      {!v ? (
        <Vazio
          titulo="A varredura ainda não foi gerada."
          acao={
            <form action={regerarVarreduraAction.bind(null, id)}>
              <Button type="submit">Gerar</Button>
            </form>
          }
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Map className="h-4 w-4 text-marca-600" aria-hidden />
                Mapa do processo
              </CardTitle>
              <CardDescription>
                Estado atual: {v.mapa.estado_atual}
                {v.mapa.ultima_peca_pendente ? ` · última peça pendente: ${v.mapa.ultima_peca_pendente}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 text-sm lg:grid-cols-2">
              <div className="min-w-0">
                <TituloSecao>Linha do tempo</TituloSecao>
                <ul className="flex flex-col divide-y divide-zinc-100">
                  {v.mapa.linha_do_tempo.map((l, i) => (
                    <li key={i} className="flex min-w-0 gap-3 py-1.5">
                      <span className="shrink-0 text-xs font-semibold text-zinc-500 tabular-nums">{l.data}</span>
                      <span className="min-w-0 leading-relaxed text-zinc-800">
                        {l.ato}
                        {l.id ? <span className="font-mono text-xs text-zinc-500"> ({l.id})</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="min-w-0 flex flex-col gap-4">
                <div>
                  <TituloSecao>Fatos controvertidos × prova</TituloSecao>
                  <ul className="flex flex-col gap-2">
                    {v.mapa.fatos_controvertidos.map((f, i) => (
                      <li key={i} className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1 leading-relaxed">
                        <Badge tom={f.situacao === "comprovado" ? "sucesso" : f.situacao === "prova_conflitante" ? "alerta" : "perigo"} className="mt-0.5">
                          {f.situacao}
                        </Badge>
                        <span className="min-w-0 flex-1 text-zinc-800">
                          {f.fato}
                          {f.prova ? <span className="text-xs text-zinc-500"> · {f.prova}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <TituloSecao>Teses das partes</TituloSecao>
                  <ul className="flex flex-col gap-2">
                    {v.mapa.teses_das_partes.map((t, i) => (
                      <li key={i} className="min-w-0 leading-relaxed text-zinc-800">
                        <strong className="text-zinc-950">{t.parte}:</strong> {t.tese} {t.impugnada ? "" : <Badge tom="alerta">sem impugnação específica</Badge>}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-marca-600" aria-hidden />
                Pontos exploráveis ({v.pontos.length})
              </CardTitle>
              <CardDescription>Marque os que entram na peça. Sem marcar nada, entram os sólidos decisivos e relevantes (ordem recomendada: {v.ordem_recomendada.join(", ") || "—"}).</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={aprovarPontosAction.bind(null, id)} className="flex flex-col gap-3">
                {v.pontos.map((p) => {
                  const aprovado = a.pontos_aprovados.includes(p.numero);
                  return (
                    <label
                      key={p.numero}
                      className={cn(
                        "flex min-w-0 gap-3 rounded-xl border bg-white p-3 text-sm shadow-xs transition-colors has-[:checked]:border-marca-400 has-[:checked]:bg-marca-50/40",
                        aprovado ? "border-marca-400 bg-marca-50/40" : "border-zinc-200",
                        p.solidez === "inviavel" ? "opacity-60" : "cursor-pointer hover:border-zinc-300",
                      )}
                    >
                      <input type="checkbox" name="pontos" value={p.numero} defaultChecked={aprovado} disabled={!podeAprovar || p.solidez === "inviavel"} className="mt-1 h-4 w-4 shrink-0 rounded accent-marca-600" />
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-semibold text-zinc-950">
                            <span className="font-mono text-xs text-zinc-500">[{p.numero}]</span> {p.titulo}
                          </span>
                          <Badge tom="contorno">Eixo {p.eixo}: {EIXOS_VARREDURA[p.eixo]}</Badge>
                          <Badge tom={TOM_SOLIDEZ[p.solidez]}>{p.solidez}</Badge>
                          <Badge tom="neutro">{p.prioridade}</Badge>
                        </span>
                        <span className="leading-relaxed text-zinc-800">
                          <strong className="text-zinc-950">Fundamento:</strong> {p.fundamento}
                        </span>
                        <span className="leading-relaxed text-zinc-800">
                          <strong className="text-zinc-950">Onde:</strong> {p.onde_nos_autos}
                        </span>
                        <span className="leading-relaxed text-zinc-800">
                          <strong className="text-zinc-950">Resposta do adversário:</strong> {p.resposta_adversario}
                        </span>
                        {p.risco ? (
                          <span className="leading-relaxed text-red-700">
                            <strong>Risco:</strong> {p.risco}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
                {podeAprovar ? (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-4">
                    <Button type="submit">Aprovar pontos marcados</Button>
                  </div>
                ) : null}
              </form>
            </CardContent>
          </Card>

          {v.descartados.length || v.lacunas_e_diligencias.length || v.riscos_ma_fe_ou_preclusao.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Descartados, lacunas e riscos</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div className="min-w-0">
                  <TituloSecao>Descartados</TituloSecao>
                  <ul className="list-disc space-y-1 pl-5 leading-relaxed text-zinc-700">
                    {v.descartados.map((d, i) => (
                      <li key={i}>
                        <span className="font-mono text-xs text-zinc-500">[{d.numero}]</span> {d.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="min-w-0">
                  <TituloSecao>Lacunas e diligências</TituloSecao>
                  <ul className="list-disc space-y-1 pl-5 leading-relaxed text-zinc-700">{v.lacunas_e_diligencias.map((l, i) => <li key={i}>{l}</li>)}</ul>
                </div>
                <div className="min-w-0">
                  <TituloSecao>Riscos de má-fé ou preclusão</TituloSecao>
                  <ul className="list-disc space-y-1 pl-5 leading-relaxed text-red-700">{v.riscos_ma_fe_ou_preclusao.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <details className="group rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 text-sm font-semibold text-zinc-700 hover:text-zinc-950 [&::-webkit-details-marker]:hidden">
              <FileText className="h-4 w-4 text-zinc-400" aria-hidden />
              Relatório completo (Parte I)
              <span className="ml-auto text-xs font-normal text-zinc-400 group-open:hidden">abrir</span>
              <span className="ml-auto hidden text-xs font-normal text-zinc-400 group-open:inline">fechar</span>
            </summary>
            <Markdown texto={a.conteudo_md ?? ""} className="border-t border-zinc-100 px-5 py-4 leading-relaxed" />
          </details>

          {podeAprovar && !a.minuta_id ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PenLine className="h-4 w-4 text-marca-600" aria-hidden />
                  Parte II: redigir a peça
                </CardTitle>
                <CardDescription>Cria a minuta com os pontos aprovados no intake (modo A: redação direta).</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={redigirDaVarreduraAction.bind(null, id)} className="flex flex-col gap-5">
                  <GrupoCampos titulo="Minuta">
                    <Campo label="Título" className="sm:col-span-2">
                      <Input name="titulo" defaultValue={`${a.parametros.objetivo} (varredura)`} required />
                    </Campo>
                    <Campo label="Tipo de peça">
                      <Select name="tipo_peca" defaultValue="contestacao">
                        {Object.entries(ROTULO_TIPO_PECA).map(([k, r]) => (
                          <option key={k} value={k}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    </Campo>
                    <Campo label="Área">
                      <Select name="area" defaultValue="civel">
                        {Object.entries(ROTULO_AREA).map(([k, r]) => (
                          <option key={k} value={k}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    </Campo>
                  </GrupoCampos>
                  <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-4">
                    <Button type="submit">Criar minuta a partir dos pontos</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
