import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Campo, Select, Textarea } from "@/components/ui/input";
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
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/jurisprudencia" className="text-sm text-zinc-500 hover:underline">
          ← Jurisprudência
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Importar jurisprudência</h1>
      </div>
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Colar registros</CardTitle>
          <CardDescription>
            CSV com cabeçalho tribunal;tipo;referencia;orgao;data;ementa (data AAAA-MM-DD ou DD/MM/AAAA; a ementa pode ter ponto e vírgula). Ou JSON: lista de objetos com as mesmas chaves.
            Tipos: sumula, sumula_vinculante, tema_repetitivo, acordao, decisao_monocratica, outro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={importarJurisprudenciaAction} className="flex flex-col gap-3">
            <Campo label="Formato">
              <Select name="formato" defaultValue="csv">
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </Select>
            </Campo>
            <Campo label="Conteúdo">
              <Textarea name="conteudo" rows={12} required placeholder={EXEMPLO_CSV} className="font-mono text-xs" />
            </Campo>
            <div className="flex justify-end">
              <Button type="submit">Importar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
