import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { buscarJurisprudencia, ErroJurisprudencia } from "@/server/jurisprudencia";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata = { title: "Jurisprudência" };
export const dynamic = "force-dynamic";

export default async function PaginaJurisprudencia({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sessao = await exigirSessao();
  const { q } = await searchParams;
  const consulta = (q ?? "").trim();
  const supabase = await criarClienteServidor();
  let resultados: Awaited<ReturnType<typeof buscarJurisprudencia>> = [];
  let erro: string | null = null;
  if (consulta) {
    try {
      resultados = await buscarJurisprudencia(supabase, sessao, consulta, 10);
    } catch (e) {
      erro = e instanceof ErroJurisprudencia ? e.message : "Falha na busca.";
    }
  }
  const podeImportar = ["socio", "advogado"].includes(sessao.papel);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Jurisprudência</h1>
          <p className="text-sm text-zinc-500">
            Busca na base do escritório. Na peça, só entra precedente que aparece aqui, pelo id de citação.
          </p>
        </div>
        {podeImportar ? (
          <Link href="/jurisprudencia/importar" className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm hover:bg-zinc-50">
            Importar
          </Link>
        ) : null}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Buscar</CardTitle>
          <CardDescription>Use a tese ou termos do caso, em português.</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex gap-2">
            <Input name="q" defaultValue={consulta} placeholder="ex.: juros de mora em repetição de indébito" required minLength={3} />
            <Button type="submit">Buscar</Button>
          </form>
        </CardContent>
      </Card>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {consulta && !erro ? (
        <Card>
          <CardHeader>
            <CardTitle>{resultados.length} resultado(s)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {resultados.length === 0 ? <p className="text-sm text-zinc-500">Nada na base para esta consulta. Não cite precedente sem registro.</p> : null}
            {resultados.map((r) => (
              <article key={`${r.jurisprudencia_id}-${r.referencia}`} className="flex flex-col gap-1 border-b border-zinc-100 pb-3 last:border-0">
                <p className="font-mono text-sm font-semibold">{r.referencia}</p>
                <p className="text-sm text-zinc-700">{r.trecho}</p>
              </article>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
