import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarDocumentos } from "@/server/documentos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/input";
import { novaVarreduraAction } from "../actions";

export const metadata = { title: "Varredura dos autos" };
export const dynamic = "force-dynamic";

export default async function PaginaNovaVarredura({ searchParams }: { searchParams: Promise<{ erro?: string; processo?: string }> }) {
  await exigirSessao();
  const { erro, processo } = await searchParams;
  const supabase = await criarClienteServidor();
  const [{ data: processos }, documentos] = await Promise.all([
    supabase.from("processos").select("id, numero_cnj_mascara").in("status", ["ativo", "suspenso"]).order("atualizado_em", { ascending: false }).limit(500),
    processo ? listarDocumentos(supabase, { processoId: processo, limite: 50 }).catch(() => []) : Promise.resolve([]),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/minutas" className="text-sm text-zinc-500 hover:underline">
          ← Peças
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Varredura dos autos</h1>
        <p className="text-sm text-zinc-500">Processo em curso com autos anexados. A IA mapeia o processo e lista os pontos exploráveis por eixo; você aprova os pontos e a peça é redigida sobre eles.</p>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Passo 0: posição</CardTitle>
          <CardDescription>Sem saber o polo, a varredura sai ambidestra e inútil.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={novaVarreduraAction} className="grid gap-3 sm:grid-cols-2">
            <Campo label="Processo" className="sm:col-span-2">
              <Select name="processo_id" defaultValue={processo ?? ""} required>
                <option value="">Escolha…</option>
                {(processos ?? []).map((p) => (
                  <option key={p.id as string} value={p.id as string}>
                    {(p.numero_cnj_mascara as string | null) ?? "sem número"}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Qual parte representamos?">
              <Input name="polo" placeholder="autor, réu, exequente, executado, terceiro, embargante" required />
            </Campo>
            <Campo label="Objetivo desta peça">
              <Input name="objetivo" placeholder="contestar, replicar, impugnar cumprimento, recorrer, defender penhora…" required />
            </Campo>
            <Campo label="Prazo em curso: termo inicial">
              <Input name="prazo_inicial" type="date" />
            </Campo>
            <Campo label="Prazo em curso: termo final">
              <Input name="prazo_final" type="date" />
            </Campo>
            {processo ? (
              <Campo label="Autos (documentos do processo)" className="sm:col-span-2">
                <div className="flex flex-wrap gap-3 text-sm">
                  {documentos.length === 0 ? <span className="text-zinc-500">Nenhum documento. Anexe o PDF dos autos em Processos → Documentos e aguarde a extração.</span> : null}
                  {documentos.map((d) => (
                    <label key={d.id} className="flex items-center gap-1">
                      <input type="checkbox" name="documento_ids" value={d.id} defaultChecked /> {d.nome}
                      {d.paginas ? ` (${d.paginas} págs.)` : ""}
                    </label>
                  ))}
                </div>
              </Campo>
            ) : (
              <p className="text-xs text-zinc-500 sm:col-span-2">Escolha o processo e recarregue com ?processo=… para listar os autos (ou use o botão na tela do processo).</p>
            )}
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit">Varrer os autos com a IA</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
