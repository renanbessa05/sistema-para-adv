import Link from "next/link";
import { Search, Upload } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { buscarJurisprudencia, ErroJurisprudencia } from "@/server/jurisprudencia";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Vazio } from "@/components/ui/alert";
import { Button, classesBotao } from "@/components/ui/button";
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Jurisprudência</h1>
          <p className="max-w-prose text-sm text-zinc-500">
            Busca na base do escritório. Na peça, só entra precedente que aparece aqui, pelo id de citação.
          </p>
        </div>
        {podeImportar ? (
          <Link href="/jurisprudencia/importar" className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
            <Upload aria-hidden />
            Importar
          </Link>
        ) : null}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-4 w-4 text-marca-600" aria-hidden />
            Buscar
          </CardTitle>
          <CardDescription>Use a tese ou termos do caso, em português.</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex flex-col gap-2 sm:flex-row">
            <Input name="q" defaultValue={consulta} placeholder="ex.: juros de mora em repetição de indébito" required minLength={3} className="min-w-0 flex-1" />
            <Button type="submit" className="h-10">
              Buscar
            </Button>
          </form>
        </CardContent>
      </Card>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {consulta && !erro ? (
        <Card>
          <CardHeader>
            <CardTitle>{resultados.length} resultado(s)</CardTitle>
            <CardDescription>Consulta: “{consulta}”</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {resultados.length === 0 ? <Vazio titulo="Nada na base para esta consulta." descricao="Não cite precedente sem registro." /> : null}
            {resultados.map((r) => (
              <article key={`${r.jurisprudencia_id}-${r.referencia}`} className="flex min-w-0 flex-col gap-1.5 border-b border-zinc-100 pb-4 last:border-0 last:pb-0">
                <p className="font-mono text-xs font-semibold text-marca-700">{r.referencia}</p>
                <p className="max-w-prose text-sm leading-relaxed text-zinc-700">{r.trecho}</p>
              </article>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
