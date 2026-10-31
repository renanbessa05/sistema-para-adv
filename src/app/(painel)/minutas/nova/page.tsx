import Link from "next/link";
import { ArrowLeft, FileText, Paperclip } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarDocumentos } from "@/server/documentos";
import { ROTULO_AREA, ROTULO_TIPO_PECA } from "@/lib/ia/schemas/minutas";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button, classesBotao } from "@/components/ui/button";
import { Campo, GrupoCampos, Input, Select, Textarea } from "@/components/ui/input";
import { novaMinutaAction } from "../actions";
import { tipoPecaPorAto } from "@/lib/pecas/tipo-por-ato";
import { ProximoPasso } from "@/components/dominio/ProximoPasso";

export const metadata = { title: "Nova minuta" };
export const dynamic = "force-dynamic";

const MODOS = [
  { valor: "C", rotulo: "C: caso novo, 6 etapas", explicacao: "Caso ainda não ajuizado: cronologia, teses, prova, defesa contrária, estratégia e, só então, redação. Cada etapa é aprovada por você." },
  { valor: "A", rotulo: "A: redação direta", explicacao: "Processo em curso: a IA redige a peça de uma vez a partir do relato e dos documentos marcados." },
  { valor: "B", rotulo: "B: revisar rascunho", explicacao: "Você já tem o texto: cole o rascunho e a IA devolve a versão corrigida." },
] as const;

export default async function PaginaNovaMinuta({ searchParams }: { searchParams: Promise<{ erro?: string; processo?: string; prazo?: string; tarefa?: string }> }) {
  await exigirSessao();
  const { erro, processo, prazo, tarefa } = await searchParams;
  const supabase = await criarClienteServidor();
  const [{ data: processos }, documentos, { data: prazos }, { data: tarefaLigada }] = await Promise.all([
    supabase.from("processos").select("id, numero_cnj_mascara").in("status", ["ativo", "suspenso"]).order("atualizado_em", { ascending: false }).limit(500),
    processo ? listarDocumentos(supabase, { processoId: processo, limite: 50 }).catch(() => []) : Promise.resolve([]),
    processo ? supabase.from("prazos").select("id, ato_descricao, data_final, status").eq("processo_id", processo).in("status", ["sugerido", "confirmado", "prorrogado", "vencido"]).order("data_final") : Promise.resolve({ data: [] }),
    tarefa ? supabase.from("tarefas").select("id, titulo, tipo").eq("id", tarefa).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const prazoLigado = (prazos ?? []).find((p) => p.id === prazo) ?? null;
  const tipoSugerido = tipoPecaPorAto((prazoLigado?.ato_descricao as string | null) ?? null, Boolean(prazoLigado));
  const modoSugerido = processo ? "A" : "C";
  const numeroProcesso = (processos ?? []).find((p) => p.id === processo)?.numero_cnj_mascara as string | null | undefined;
  const tituloSugerido = prazoLigado ? `${(prazoLigado.ato_descricao as string | null) ?? "Peça"}${numeroProcesso ? ` · ${numeroProcesso}` : ""}` : "";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link href="/minutas" className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-500 hover:text-marca-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Peças
          </Link>
          <h1 className="mt-1 text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Nova minuta</h1>
          <p className="text-sm text-zinc-500">Modo C (caso novo): seis etapas com aprovação, redação só na última. Modo A: redação direta a partir do relato. Modo B: revisão de um rascunho colado.</p>
        </div>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {tarefaLigada ? <ProximoPasso titulo={`Peça da tarefa «${tarefaLigada.titulo as string}»`} descricao="Processo, prazo e tarefa já vêm ligados. Ao protocolar esta peça, a tarefa é concluída e o prazo, cumprido." /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {MODOS.map((m) => (
          <div key={m.valor} className={m.valor === modoSugerido ? "rounded-xl border border-marca-200 bg-marca-50/60 p-4" : "rounded-xl border border-zinc-200 bg-white p-4"}>
            <p className="flex items-center gap-2 text-[13px] font-bold text-zinc-950">
              <span className={m.valor === modoSugerido ? "grid h-6 w-6 place-items-center rounded-md bg-marca-600 text-[12px] font-extrabold text-white" : "grid h-6 w-6 place-items-center rounded-md bg-zinc-100 text-[12px] font-extrabold text-zinc-600"} aria-hidden>
                {m.valor}
              </span>
              {m.rotulo.slice(3)}
              {m.valor === modoSugerido ? <span className="ml-auto text-[11px] font-bold tracking-[0.06em] text-marca-700 uppercase">sugerido</span> : null}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-snug text-zinc-500">{m.explicacao}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-marca-600" aria-hidden />
            Intake (Passo 2 da skill)
          </CardTitle>
          <CardDescription>O que o banco já sabe (partes, comarca, documentos, prazo) é preenchido sozinho; o resto vira pergunta ou lacuna.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={novaMinutaAction} className="flex flex-col gap-7">
            {tarefaLigada ? <input type="hidden" name="tarefa_id" value={tarefaLigada.id as string} /> : null}

            <GrupoCampos titulo="Peça" descricao="Como a peça será produzida e o que ela é." colunas={3}>
              <Campo label="Título" className="sm:col-span-2" dica="Um nome curto para achar a peça na lista.">
                <Input name="titulo" required placeholder="Inicial de indenização da Marina" defaultValue={tituloSugerido} />
              </Campo>
              <Campo label="Modo" dica={processo ? "Processo escolhido: redação direta é o caminho mais curto." : "Sem processo: o caso novo passa pelas seis etapas."}>
                <Select name="modo" defaultValue={modoSugerido}>
                  {MODOS.map((m) => (
                    <option key={m.valor} value={m.valor}>
                      {m.rotulo}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Tipo de peça" dica={prazoLigado ? "Sugerido pelo ato do prazo vinculado." : "Define estrutura, endereçamento e pedidos padrão."}>
                <Select name="tipo_peca" defaultValue={tipoSugerido}>
                  {Object.entries(ROTULO_TIPO_PECA).map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Área">
                <Select name="area" defaultValue="civel">
                  {Object.entries(ROTULO_AREA).map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Grau">
                <Select name="grau" defaultValue="primeiro">
                  <option value="primeiro">1º grau</option>
                  <option value="segundo">2º grau</option>
                </Select>
              </Campo>
            </GrupoCampos>

            <GrupoCampos titulo="Processo e prazo" descricao="Ligue a peça ao processo e ao prazo: ao protocolar, o prazo é cumprido sozinho." colunas={3}>
              <Campo label="Processo (opcional)" dica="Deixe «caso ainda não ajuizado» para petição inicial.">
                <Select name="processo_id" defaultValue={processo ?? ""}>
                  <option value="">Caso ainda não ajuizado</option>
                  {(processos ?? []).map((p) => (
                    <option key={p.id as string} value={p.id as string}>
                      {(p.numero_cnj_mascara as string | null) ?? "sem número"}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Prazo vinculado (opcional)" dica={processo ? undefined : "Aparece depois de escolher um processo e recarregar."}>
                <Select name="prazo_id" defaultValue={prazo ?? ""}>
                  <option value="">Nenhum</option>
                  {(prazos ?? []).map((p) => (
                    <option key={p.id as string} value={p.id as string}>
                      {(p.ato_descricao as string | null) ?? "prazo"} · {String(p.data_final)}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Parte contrária">
                <Input name="parte_contraria" />
              </Campo>
              <Campo label="Comarca">
                <Input name="comarca" placeholder="Cuiabá" />
              </Campo>
              <Campo label="Vara">
                <Input name="vara" placeholder="1ª Vara Cível" />
              </Campo>
            </GrupoCampos>

            <GrupoCampos titulo="Conteúdo" descricao="Relato para os modos A e C; rascunho para o modo B. Quanto mais fatos e datas, menos lacunas." colunas={1}>
              <Campo label="Relato dos fatos (Modos A e C)" dica="Narrativa cronológica, o que o cliente quer, documentos que tem, urgência.">
                <Textarea name="relato" rows={8} placeholder="Narrativa cronológica, o que o cliente quer, documentos, urgência…" className="leading-relaxed" />
              </Campo>
              <Campo label="Rascunho da peça (Modo B)" dica="Cole o texto inteiro; a IA mantém a estrutura e corrige o que precisar.">
                <Textarea name="rascunho" rows={6} placeholder="Cole aqui a petição a revisar" className="leading-relaxed" />
              </Campo>
            </GrupoCampos>

            <GrupoCampos titulo="Pedidos e peculiaridades" colunas={3}>
              <Campo label="Pedidos pretendidos">
                <Textarea name="pedidos" rows={2} className="min-h-20" />
              </Campo>
              <Campo label="Urgência (tutela?)">
                <Textarea name="urgencia" rows={2} className="min-h-20" />
              </Campo>
              <Campo label="Peculiaridades / jurisprudência conhecida">
                <Textarea name="peculiaridades" rows={2} className="min-h-20" />
              </Campo>
            </GrupoCampos>

            <GrupoCampos titulo="Documentos" descricao="Os marcados entram como contexto da redação." colunas={1}>
              {processo ? (
                <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
                  <p className="text-[13px] font-semibold text-zinc-700">Documentos do processo a considerar</p>
                  {documentos.length === 0 ? <p className="text-sm text-zinc-500">Nenhum documento anexado ao processo. Anexe em Processos → Documentos.</p> : null}
                  {documentos.length ? (
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {documentos.map((d) => (
                        <li key={d.id}>
                          <label className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm text-zinc-800 hover:bg-white">
                            <input type="checkbox" name="documento_ids" value={d.id} defaultChecked className="mt-0.5 h-4 w-4 shrink-0 rounded accent-marca-600" />
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{d.nome}</span>
                              {d.paginas ? <span className="block text-xs text-zinc-500">{d.paginas} págs.</span> : null}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : (
                <p className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-xs text-zinc-500">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                  Escolha um processo e recarregue a página para selecionar documentos.
                </p>
              )}
            </GrupoCampos>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 pt-5">
              <Link href="/minutas" className={classesBotao({ variante: "contorno" })}>
                Cancelar
              </Link>
              <Button type="submit">Criar minuta</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
