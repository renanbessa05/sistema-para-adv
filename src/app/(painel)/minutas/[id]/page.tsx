import Link from "next/link";
import { notFound } from "next/navigation";
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
import { formatarDataHora } from "@/lib/utils";
import { aprovarEtapaAction, arquivarMinutaAction, devolverEtapaAction, enviarAprovacaoMinutaAction, gerarEtapaAction, marcarProtocoladaAction, novaVersaoAction, pularEtapasAction } from "../actions";

export const metadata = { title: "Minuta" };
export const dynamic = "force-dynamic";

const TOM_SITUACAO: Record<string, "sucesso" | "alerta" | "perigo" | "neutro"> = { ok: "sucesso", atencao: "alerta", falta: "perigo", nao_aplicavel: "neutro" };

export default async function PaginaMinuta({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  const { id } = await params;
  const { erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const m = await obterMinuta(supabase, id);
  if (!m) notFound();
  const [etapas, versoes, documentos, { data: esc }, { data: processo }] = await Promise.all([
    listarEtapas(supabase, id),
    listarVersoes(supabase, id),
    listarDocumentos(supabase, { processoId: m.processo_id ?? undefined, limite: 50 }).catch(() => []),
    supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).maybeSingle(),
    m.processo_id ? supabase.from("processos").select("numero_cnj_mascara").eq("id", m.processo_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const timeZone = (esc?.timezone as string | undefined) ?? "America/Cuiaba";
  const podeAprovar = ["socio", "advogado"].includes(sessao.papel);
  const versaoAtual = versoes.find((v) => v.id === m.versao_atual_id) ?? versoes[0] ?? null;
  const emAndamento = ["rascunho", "em_etapas", "devolvida", "redigida", "em_revisao_ia"].includes(m.status);
  const docsDaMinuta = documentos.filter((d) => versoes.some((v) => v.documento_id === d.id));
  const validacao = (versaoAtual?.validacao ?? {}) as { itens?: ItemValidacao[]; lacunas?: number; pronta?: boolean; laudas_estimadas?: number };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/minutas" className="text-sm text-zinc-500 hover:underline">
            ← Peças
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {m.titulo}
            <Badge tom={m.status === "aprovada" || m.status === "protocolada" ? "sucesso" : m.status === "devolvida" ? "perigo" : "info"}>{ROTULO_STATUS_MINUTA[m.status] ?? m.status}</Badge>
          </h1>
          <p className="text-sm text-zinc-500">
            {ROTULO_TIPO_PECA[m.tipo_peca]} · {ROTULO_AREA[m.area]} · modo {m.modo}
            {processo?.numero_cnj_mascara ? (
              <>
                {" · "}
                <Link href={`/processos/${m.processo_id}`} className="font-mono hover:underline">
                  {processo.numero_cnj_mascara as string}
                </Link>
              </>
            ) : " · caso ainda não ajuizado"}
          </p>
        </div>
        {emAndamento ? (
          <form action={arquivarMinutaAction.bind(null, id)} className="flex gap-1">
            <Select name="status" defaultValue="arquivada" className="w-36" aria-label="Encerrar">
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

      {/* Stepper */}
      {m.modo === "C" ? (
        <div className="flex flex-wrap gap-1 text-xs">
          {[1, 2, 3, 4, 5, 6].map((n) => {
            const e = etapas.find((x) => x.numero === n);
            const tom = e?.status === "aprovada" ? "sucesso" : e?.status === "pulada" ? "neutro" : e?.status === "devolvida" ? "perigo" : e ? "alerta" : n === m.etapa_atual ? "info" : "contorno";
            return (
              <Badge key={n} tom={tom}>
                {n}. {TITULO_ETAPA[n]}
                {e ? ` · ${e.status}` : n === m.etapa_atual ? " · atual" : ""}
              </Badge>
            );
          })}
        </div>
      ) : null}

      {/* Etapas 1-5 */}
      {m.modo === "C"
        ? [1, 2, 3, 4, 5].map((n) => {
            const e = etapas.find((x) => x.numero === n);
            const atual = n === m.etapa_atual && emAndamento;
            if (!e && !atual) return null;
            return (
              <Card key={n}>
                <CardHeader>
                  <CardTitle>
                    Etapa {n}: {TITULO_ETAPA[n]}
                  </CardTitle>
                  <CardDescription>{e ? `${e.status}${e.aprovada_em ? ` em ${formatarDataHora(e.aprovada_em, timeZone)}` : ""}${e.comentarios ? ` · comentário: ${e.comentarios}` : ""}` : "Ainda não gerada."}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {e?.conteudo_md ? <Markdown texto={e.conteudo_md} /> : null}
                  {atual ? (
                    <div className="flex flex-wrap gap-2">
                      <form action={gerarEtapaAction.bind(null, id, n)}>
                        <Button type="submit" variante={e ? "contorno" : "primaria"}>
                          {e ? "Gerar de novo" : "Gerar com a IA"}
                        </Button>
                      </form>
                      {e && e.status !== "aprovada" && podeAprovar ? (
                        <>
                          <form action={aprovarEtapaAction.bind(null, id, n)} className="flex gap-1">
                            <Input name="comentario" placeholder="Comentário (opcional)" className="w-56" />
                            <Button type="submit">Aprovar e seguir</Button>
                          </form>
                          <form action={devolverEtapaAction.bind(null, id, n)} className="flex gap-1">
                            <Input name="comentario" placeholder="O que refazer" className="w-56" required />
                            <Button type="submit" variante="secundaria">
                              Devolver
                            </Button>
                          </form>
                        </>
                      ) : null}
                      {podeAprovar ? (
                        <form action={pularEtapasAction.bind(null, id)} className="flex gap-1">
                          <Select name="ate" defaultValue="6" className="w-32" aria-label="Pular até">
                            {[2, 3, 4, 5, 6].filter((k) => k > n).map((k) => (
                              <option key={k} value={k}>
                                Pular até {k}
                              </option>
                            ))}
                          </Select>
                          <Input name="motivo" placeholder="Motivo" className="w-40" />
                          <Button type="submit" variante="fantasma">
                            Pular
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        : null}

      {/* Etapa 6 / redação */}
      {(m.modo !== "C" || m.etapa_atual === 6 || versaoAtual) ? (
        <Card>
          <CardHeader>
            <CardTitle>{m.modo === "C" ? "Etapa 6: Redação" : m.modo === "B" ? "Revisão do rascunho" : "Redação"}</CardTitle>
            <CardDescription>
              {versaoAtual ? `Versão ${versaoAtual.numero} (${versaoAtual.autor_tipo === "ia" ? "IA" : "advogada"}) · ${formatarDataHora(versaoAtual.criado_em, timeZone)} · ${validacao.lacunas ?? 0} lacuna(s) · ~${validacao.laudas_estimadas ?? "?"} lauda(s)` : "Sem versão ainda."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {emAndamento ? (
              <form action={gerarEtapaAction.bind(null, id, 6)}>
                <Button type="submit" variante={versaoAtual ? "contorno" : "primaria"}>
                  {versaoAtual ? "Redigir de novo com a IA" : "Redigir com a IA"}
                </Button>
              </form>
            ) : null}
            {validacao.itens?.length ? (
              <div className="grid gap-1 sm:grid-cols-2">
                {validacao.itens.map((i) => (
                  <div key={i.id} className="flex items-start gap-2 text-sm">
                    <Badge tom={TOM_SITUACAO[i.situacao] ?? "neutro"}>{i.situacao === "nao_aplicavel" ? "n/a" : i.situacao}</Badge>
                    <span>
                      {i.rotulo}
                      {i.detalhe ? <span className="block text-xs text-zinc-500">{i.detalhe}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {versaoAtual ? (
              <details open>
                <summary className="cursor-pointer text-sm text-zinc-500">Texto da peça</summary>
                <Markdown texto={versaoAtual.conteudo_md} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800" />
              </details>
            ) : null}
            {versaoAtual && (emAndamento || m.status === "aprovada") ? (
              <form action={novaVersaoAction.bind(null, id)} className="flex flex-col gap-2">
                <Campo label="Editar o texto (Markdown) e salvar como nova versão">
                  <Textarea name="conteudo_md" rows={16} defaultValue={versaoAtual.conteudo_md} className="font-mono text-xs" />
                </Campo>
                <div className="flex gap-2">
                  <Input name="resumo" placeholder="O que mudou (opcional)" className="w-72" />
                  <Button type="submit" variante="secundaria">
                    Salvar nova versão e .docx
                  </Button>
                </div>
              </form>
            ) : null}
            {docsDaMinuta.length ? <CartaoDocumentos documentos={docsDaMinuta} voltar={`/minutas/${id}`} processoId={m.processo_id ?? undefined} papel={sessao.papel} timeZone={timeZone} /> : null}
            {versaoAtual && ["redigida", "devolvida", "em_revisao_ia"].includes(m.status) && podeAprovar ? (
              <form action={enviarAprovacaoMinutaAction.bind(null, id)} className="flex items-end gap-2">
                <Campo label={validacao.lacunas ? `Há ${validacao.lacunas} lacuna(s): justifique para enviar mesmo assim` : "Comentário (opcional)"}>
                  <Input name="comentario" className="w-80" />
                </Campo>
                <Button type="submit">Enviar para aprovação</Button>
              </form>
            ) : null}
            {m.status === "aguardando_aprovacao" ? (
              <Alert tom="info">
                Aguardando decisão em{" "}
                <Link href="/aprovacoes" className="underline">
                  Aprovações
                </Link>
                .
              </Alert>
            ) : null}
            {m.status === "aprovada" && podeAprovar ? (
              <form action={marcarProtocoladaAction.bind(null, id)} className="flex items-end gap-2">
                <Campo label="Número do protocolo (opcional)">
                  <Input name="numero_protocolo" className="w-64" />
                </Campo>
                <Button type="submit">Marcar como protocolada</Button>
              </form>
            ) : null}
            {versoes.length > 1 ? (
              <details className="text-xs text-zinc-500">
                <summary>Versões anteriores ({versoes.length - 1})</summary>
                <ul>
                  {versoes.filter((v) => v.id !== versaoAtual?.id).map((v) => (
                    <li key={v.id}>
                      v{v.numero} · {v.autor_tipo} · {formatarDataHora(v.criado_em, timeZone)} · {v.resumo_alteracoes ?? ""}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
