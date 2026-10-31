import Link from "next/link";
import { ArrowLeft, Upload } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button, classesBotao } from "@/components/ui/button";
import { Campo, GrupoCampos, Select, Textarea } from "@/components/ui/input";
import { importarJurisprudenciaAction } from "../actions";

export const metadata = { title: "Importar jurisprudência" };
export const dynamic = "force-dynamic";

const EXEMPLO_CSV = "tribunal;tipo;referencia;orgao;data;ementa\nSTJ;sumula;Súmula 7/STJ;Segunda Seção;;A pretensão de simples reexame de prova não enseja recurso especial.";

export default async function PaginaImportarJurisprudencia({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sessao = await exigirSessao();
  const { ok, erro } = await searchParams;
  if (!["socio", "advogado"].includes(sessao.papel)) {
    return <Alert tom="perigo">Apenas advogado ou sócio importa jurisprudência.</Alert>;
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex flex-col gap-1">
          <Link href="/jurisprudencia" className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-500 hover:text-marca-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Jurisprudência
          </Link>
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Importar jurisprudência</h1>
          <p className="text-sm text-zinc-500">Súmulas, temas e acórdãos entram na base do escritório e ficam disponíveis para citação nas peças.</p>
        </div>
      </div>
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-marca-600" aria-hidden />
            Colar registros
          </CardTitle>
          <CardDescription className="max-w-prose leading-relaxed">
            CSV com cabeçalho <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[12px] text-zinc-700">tribunal;tipo;referencia;orgao;data;ementa</code> (data AAAA-MM-DD ou DD/MM/AAAA; a ementa pode ter ponto e vírgula). Ou JSON: lista de objetos com as mesmas chaves.
            Tipos: sumula, sumula_vinculante, tema_repetitivo, acordao, decisao_monocratica, outro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={importarJurisprudenciaAction} className="flex flex-col gap-5">
            <GrupoCampos titulo="Registros" colunas={1}>
              <Campo label="Formato" className="sm:max-w-xs">
                <Select name="formato" defaultValue="csv">
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </Select>
              </Campo>
              <Campo label="Conteúdo" dica="Cole o CSV com cabeçalho ou a lista JSON. O exemplo no campo mostra o formato esperado.">
                <Textarea name="conteudo" rows={12} required placeholder={EXEMPLO_CSV} className="font-mono text-xs leading-relaxed" />
              </Campo>
            </GrupoCampos>
            <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-4">
              <Link href="/jurisprudencia" className={classesBotao({ variante: "contorno" })}>
                Cancelar
              </Link>
              <Button type="submit">Importar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
