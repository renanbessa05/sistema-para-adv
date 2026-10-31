import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarDocumentos } from "@/server/documentos";
import { ROTULO_AREA, ROTULO_TIPO_PECA } from "@/lib/ia/schemas/minutas";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select, Textarea } from "@/components/ui/input";
import { novaMinutaAction } from "../actions";
import { tipoPecaPorAto } from "@/lib/pecas/tipo-por-ato";
import { ProximoPasso } from "@/components/dominio/ProximoPasso";

export const metadata = { title: "Nova minuta" };
export const dynamic = "force-dynamic";

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
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/minutas" className="text-sm text-zinc-500 hover:underline">
          ← Peças
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Nova minuta</h1>
        <p className="text-sm text-zinc-500">Modo C (caso novo): seis etapas com aprovação, redação só na última. Modo A: redação direta a partir do relato. Modo B: revisão de um rascunho colado.</p>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {tarefaLigada ? <ProximoPasso titulo={`Peça da tarefa «${tarefaLigada.titulo as string}»`} descricao="Processo, prazo e tarefa já vêm ligados. Ao protocolar esta peça, a tarefa é concluída e o prazo, cumprido." /> : null}
      <Card>
        <CardHeader>
          <CardTitle>Intake (Passo 2 da skill)</CardTitle>
          <CardDescription>O que o banco já sabe (partes, comarca, documentos, prazo) é preenchido sozinho; o resto vira pergunta ou lacuna.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={novaMinutaAction} className="grid gap-3 sm:grid-cols-3">
            {tarefaLigada ? <input type="hidden" name="tarefa_id" value={tarefaLigada.id as string} /> : null}
            <Campo label="Título" className="sm:col-span-2">
              <Input name="titulo" required placeholder="Inicial de indenização da Marina" defaultValue={tituloSugerido} />
            </Campo>
            <Campo label="Modo">
              <Select name="modo" defaultValue={modoSugerido}>
                <option value="C">C: caso novo, 6 etapas</option>
                <option value="A">A: redação direta</option>
                <option value="B">B: revisar rascunho</option>
              </Select>
            </Campo>
            <Campo label="Tipo de peça">
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
            <Campo label="Processo (opcional)">
              <Select name="processo_id" defaultValue={processo ?? ""}>
                <option value="">Caso ainda não ajuizado</option>
                {(processos ?? []).map((p) => (
                  <option key={p.id as string} value={p.id as string}>
                    {(p.numero_cnj_mascara as string | null) ?? "sem número"}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Prazo vinculado (opcional)">
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
            <Campo label="Relato dos fatos (Modos A e C)" className="sm:col-span-3">
              <Textarea name="relato" rows={8} placeholder="Narrativa cronológica, o que o cliente quer, documentos, urgência…" />
            </Campo>
            <Campo label="Rascunho da peça (Modo B)" className="sm:col-span-3">
              <Textarea name="rascunho" rows={6} placeholder="Cole aqui a petição a revisar" />
            </Campo>
            <Campo label="Pedidos pretendidos">
              <Textarea name="pedidos" rows={2} />
            </Campo>
            <Campo label="Urgência (tutela?)">
              <Textarea name="urgencia" rows={2} />
            </Campo>
            <Campo label="Peculiaridades / jurisprudência conhecida">
              <Textarea name="peculiaridades" rows={2} />
            </Campo>
            {processo ? (
              <Campo label="Documentos do processo a considerar" className="sm:col-span-3">
                <div className="flex flex-wrap gap-3 text-sm">
                  {documentos.length === 0 ? <span className="text-zinc-500">Nenhum documento anexado ao processo. Anexe em Processos → Documentos.</span> : null}
                  {documentos.map((d) => (
                    <label key={d.id} className="flex items-center gap-1">
                      <input type="checkbox" name="documento_ids" value={d.id} defaultChecked /> {d.nome}
                      {d.paginas ? ` (${d.paginas} págs.)` : ""}
                    </label>
                  ))}
                </div>
              </Campo>
            ) : (
              <p className="text-xs text-zinc-500 sm:col-span-3">Escolha um processo e recarregue a página para selecionar documentos.</p>
            )}
            <div className="flex justify-end sm:col-span-3">
              <Button type="submit">Criar minuta</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
