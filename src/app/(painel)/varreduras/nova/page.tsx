import Link from "next/link";
import { ArrowLeft, Scan } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarDocumentos } from "@/server/documentos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { BotaoEnviar } from "@/components/ui/BotaoEnviar";
import { Campo, GrupoCampos, Input, Select } from "@/components/ui/input";
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex flex-col gap-1">
          <Link href="/minutas" className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-500 hover:text-marca-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Peças
          </Link>
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Varredura dos autos</h1>
          <p className="max-w-prose text-sm text-zinc-500">Processo em curso com autos anexados. A IA mapeia o processo e lista os pontos exploráveis por eixo; você aprova os pontos e a peça é redigida sobre eles.</p>
        </div>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scan className="h-4 w-4 text-marca-600" aria-hidden />
            Passo 0: posição
          </CardTitle>
          <CardDescription>Sem saber o polo, a varredura sai ambidestra e inútil.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={novaVarreduraAction} className="flex flex-col gap-5">
            <GrupoCampos titulo="Processo" colunas={1}>
              <Campo label="Processo">
                <Select name="processo_id" defaultValue={processo ?? ""} required className="font-mono">
                  <option value="">Escolha…</option>
                  {(processos ?? []).map((p) => (
                    <option key={p.id as string} value={p.id as string}>
                      {(p.numero_cnj_mascara as string | null) ?? "sem número"}
                    </option>
                  ))}
                </Select>
              </Campo>
            </GrupoCampos>
            <GrupoCampos titulo="Posição e objetivo">
              <Campo label="Qual parte representamos?" dica="O polo define de que lado a IA lê cada ato dos autos.">
                <Input name="polo" placeholder="autor, réu, exequente, executado, terceiro, embargante" required />
              </Campo>
              <Campo label="Objetivo desta peça">
                <Input name="objetivo" placeholder="contestar, replicar, impugnar cumprimento, recorrer, defender penhora…" required />
              </Campo>
            </GrupoCampos>
            <GrupoCampos titulo="Prazo em curso" descricao="Opcional. Com as datas, a varredura prioriza o que cabe no prazo.">
              <Campo label="Prazo em curso: termo inicial">
                <Input name="prazo_inicial" type="date" className="tabular-nums" />
              </Campo>
              <Campo label="Prazo em curso: termo final">
                <Input name="prazo_final" type="date" className="tabular-nums" />
              </Campo>
            </GrupoCampos>
            {processo ? (
              <GrupoCampos titulo="Autos (documentos do processo)" descricao="Desmarque o que não deve entrar na leitura." colunas={1}>
                {documentos.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 px-4 py-5 text-center text-sm text-zinc-500">Nenhum documento. Anexe o PDF dos autos em Processos → Documentos e aguarde a extração.</p>
                ) : (
                  <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
                    {documentos.map((d) => (
                      <li key={d.id}>
                        <label className="flex min-w-0 cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-marca-50/40">
                          <input type="checkbox" name="documento_ids" value={d.id} defaultChecked className="h-4 w-4 shrink-0 rounded accent-marca-600" />
                          <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">{d.nome}</span>
                          {d.paginas ? <span className="shrink-0 text-xs text-zinc-500 tabular-nums">{`(${d.paginas} págs.)`}</span> : null}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </GrupoCampos>
            ) : (
              <Alert tom="info">Escolha o processo e recarregue com ?processo=… para listar os autos (ou use o botão na tela do processo).</Alert>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-4">
              <BotaoEnviar rotuloEnviando="Varrendo os autos… pode levar uns minutos">Varrer os autos com a IA</BotaoEnviar>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
