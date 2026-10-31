import Link from "next/link";
import { Plus } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Vazio } from "@/components/ui/alert";
import { classesBotao } from "@/components/ui/button";
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Cálculos</h1>
          <p className="max-w-prose text-sm text-zinc-500">
            Atualização monetária e juros. Índices do BCB; regras marcadas &ldquo;a confirmar&rdquo; dependem de revisão da advogada.
          </p>
        </div>
        <Link href="/calculos/novo" className={classesBotao({ variante: "primaria" })}>
          <Plus aria-hidden />
          Novo cálculo
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{lista.length} cálculo(s)</CardTitle>
        </CardHeader>
        <CardContent className={lista.length === 0 ? undefined : "px-2 pb-2"}>
          {lista.length === 0 ? (
            <Vazio
              titulo="Nenhum cálculo ainda."
              acao={
                <Link href="/calculos/novo" className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                  Novo cálculo
                </Link>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Título</TH>
                  <TH>Regra</TH>
                  <TH className="text-right">Total</TH>
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
                      <TD className="min-w-0 max-w-[280px]">
                        <Link href={`/calculos/${c.id}`} className="block truncate font-semibold text-zinc-950 hover:text-marca-700">
                          {c.titulo as string}
                        </Link>
                      </TD>
                      <TD className="font-mono text-xs text-zinc-600">{c.regra_codigo as string}</TD>
                      <TD className="text-right font-semibold text-zinc-950 tabular-nums whitespace-nowrap">{resultado ? formatarReais(Number(resultado.totais.total)) : "—"}</TD>
                      <TD>
                        <Badge tom={status === "aprovado" ? "sucesso" : status === "rejeitado" ? "perigo" : "info"}>{status}</Badge>
                      </TD>
                      <TD className="text-xs text-zinc-500 tabular-nums whitespace-nowrap">{formatarData(String(c.atualizado_em).slice(0, 10))}</TD>
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
