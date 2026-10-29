import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterAnalise } from "@/server/varreduras";
import { EIXOS_VARREDURA, ROTULO_AREA, ROTULO_TIPO_PECA } from "@/lib/ia/schemas/minutas";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/input";
import { Markdown } from "@/components/dominio/Markdown";
import { aprovarPontosAction, redigirDaVarreduraAction, regerarVarreduraAction } from "../actions";

export const metadata = { title: "Varredura" };
export const dynamic = "force-dynamic";

const TOM_SOLIDEZ: Record<string, "sucesso" | "alerta" | "perigo"> = { solida: "sucesso", arriscada: "alerta", inviavel: "perigo" };

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
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/minutas" className="text-sm text-zinc-500 hover:underline">
          ← Peças
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          Varredura dos autos <Badge tom={a.status === "aprovada" ? "sucesso" : "info"}>{a.status}</Badge>
        </h1>
        <p className="text-sm text-zinc-500">
          Polo: {a.parametros.polo} · objetivo: {a.parametros.objetivo}
          {a.parametros.prazo_termo_final ? ` · prazo até ${a.parametros.prazo_termo_final}` : ""}
          {a.minuta_id ? (
            <>
              {" · "}
              <Link href={`/minutas/${a.minuta_id}`} className="underline">
                minuta criada
              </Link>
            </>
          ) : null}
        </p>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      {!v ? (
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <p className="text-sm text-zinc-500">A varredura ainda não foi gerada.</p>
            <form action={regerarVarreduraAction.bind(null, id)}>
              <Button type="submit">Gerar</Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Mapa do processo</CardTitle>
              <CardDescription>
                Estado atual: {v.mapa.estado_atual}
                {v.mapa.ultima_peca_pendente ? ` · última peça pendente: ${v.mapa.ultima_peca_pendente}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm lg:grid-cols-2">
              <div>
                <p className="font-medium">Linha do tempo</p>
                <ul className="list-disc pl-5">
                  {v.mapa.linha_do_tempo.map((l, i) => (
                    <li key={i}>
                      {l.data} · {l.ato}
                      {l.id ? <span className="text-xs text-zinc-500"> ({l.id})</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium">Fatos controvertidos × prova</p>
                <ul className="list-disc pl-5">
                  {v.mapa.fatos_controvertidos.map((f, i) => (
                    <li key={i}>
                      <Badge tom={f.situacao === "comprovado" ? "sucesso" : f.situacao === "prova_conflitante" ? "alerta" : "perigo"}>{f.situacao}</Badge> {f.fato}
                      {f.prova ? <span className="text-xs text-zinc-500"> · {f.prova}</span> : null}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 font-medium">Teses das partes</p>
                <ul className="list-disc pl-5">
                  {v.mapa.teses_das_partes.map((t, i) => (
                    <li key={i}>
                      <strong>{t.parte}:</strong> {t.tese} {t.impugnada ? "" : <Badge tom="alerta">sem impugnação específica</Badge>}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pontos exploráveis ({v.pontos.length})</CardTitle>
              <CardDescription>Marque os que entram na peça. Sem marcar nada, entram os sólidos decisivos e relevantes (ordem recomendada: {v.ordem_recomendada.join(", ") || "—"}).</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={aprovarPontosAction.bind(null, id)} className="flex flex-col gap-3">
                {v.pontos.map((p) => (
                  <label key={p.numero} className={`flex gap-2 rounded-md border p-2 text-sm ${a.pontos_aprovados.includes(p.numero) ? "border-zinc-900 dark:border-zinc-100" : "border-zinc-200 dark:border-zinc-800"} ${p.solidez === "inviavel" ? "opacity-60" : ""}`}>
                    <input type="checkbox" name="pontos" value={p.numero} defaultChecked={a.pontos_aprovados.includes(p.numero)} disabled={!podeAprovar || p.solidez === "inviavel"} className="mt-1" />
                    <span className="flex flex-col gap-1">
                      <span className="font-medium">
                        [{p.numero}] {p.titulo} <Badge tom="contorno">Eixo {p.eixo}: {EIXOS_VARREDURA[p.eixo]}</Badge> <Badge tom={TOM_SOLIDEZ[p.solidez]}>{p.solidez}</Badge> <Badge tom="neutro">{p.prioridade}</Badge>
                      </span>
                      <span>
                        <strong>Fundamento:</strong> {p.fundamento}
                      </span>
                      <span>
                        <strong>Onde:</strong> {p.onde_nos_autos}
                      </span>
                      <span>
                        <strong>Resposta do adversário:</strong> {p.resposta_adversario}
                      </span>
                      {p.risco ? <span className="text-red-700"><strong>Risco:</strong> {p.risco}</span> : null}
                    </span>
                  </label>
                ))}
                {podeAprovar ? (
                  <div className="flex justify-end">
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
              <CardContent className="grid gap-3 text-sm lg:grid-cols-3">
                <div>
                  <p className="font-medium">Descartados</p>
                  <ul className="list-disc pl-5">{v.descartados.map((d, i) => <li key={i}>[{d.numero}] {d.motivo}</li>)}</ul>
                </div>
                <div>
                  <p className="font-medium">Lacunas e diligências</p>
                  <ul className="list-disc pl-5">{v.lacunas_e_diligencias.map((l, i) => <li key={i}>{l}</li>)}</ul>
                </div>
                <div>
                  <p className="font-medium">Riscos de má-fé ou preclusão</p>
                  <ul className="list-disc pl-5">{v.riscos_ma_fe_ou_preclusao.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <details>
            <summary className="cursor-pointer text-sm text-zinc-500">Relatório completo (Parte I)</summary>
            <Markdown texto={a.conteudo_md ?? ""} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800" />
          </details>

          {podeAprovar && !a.minuta_id ? (
            <Card>
              <CardHeader>
                <CardTitle>Parte II: redigir a peça</CardTitle>
                <CardDescription>Cria a minuta com os pontos aprovados no intake (modo A: redação direta).</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={redigirDaVarreduraAction.bind(null, id)} className="grid gap-2 sm:grid-cols-4">
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
                  <div className="flex justify-end sm:col-span-4">
                    <Button type="submit">Criar minuta a partir dos pontos</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}
          <form action={regerarVarreduraAction.bind(null, id)}>
            <Button type="submit" variante="fantasma" tamanho="sm">
              Refazer a varredura
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
