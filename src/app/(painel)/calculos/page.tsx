import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatarReais } from "@/lib/honorarios/tabela";
import { formatarData } from "@/lib/utils";

export const metadata = { title: "Cálculos" };
export const dynamic = "force-dynamic";

type Resultado = { totais: { total: number } } | null;

export default async function PaginaCalculos() {
  await exigirSessao();
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("calculos")
    .select("id, titulo, regra_codigo, status, resultado, atualizado_em")
    .order("atualizado_em", { ascending: false })
    .limit(200);
  const lista = data ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Cálculos</h1>
          <p className="text-sm text-zinc-500">
            Atualização monetária e juros. Índices do BCB; regras marcadas &ldquo;a confirmar&rdquo; dependem de revisão da advogada.
          </p>
        </div>
        <Link href="/calculos/novo" className="inline-flex h-9 items-center rounded-md bg-marca-600 px-4 text-sm text-white shadow-sm hover:bg-marca-700">
          Novo cálculo
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{lista.length} cálculo(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {lista.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhum cálculo ainda.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Título</TH>
                  <TH>Regra</TH>
                  <TH>Total</TH>
                  <TH>Status</TH>
                  <TH>Atualizado</TH>
                </TR>
              </THead>
              <TBody>
                {lista.map((c) => {
                  const resultado = c.resultado as Resultado;
                  const status = c.status as string;
                  return (
                    <TR key={c.id as string}>
                      <TD>
                        <Link href={`/calculos/${c.id}`} className="hover:underline">
                          {c.titulo as string}
                        </Link>
                      </TD>
                      <TD className="font-mono text-xs">{c.regra_codigo as string}</TD>
                      <TD>{resultado ? formatarReais(Number(resultado.totais.total)) : "—"}</TD>
                      <TD>
                        <Badge tom={status === "aprovado" ? "sucesso" : status === "rejeitado" ? "perigo" : "info"}>{status}</Badge>
                      </TD>
                      <TD className="text-xs text-zinc-500">{formatarData(String(c.atualizado_em).slice(0, 10))}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
