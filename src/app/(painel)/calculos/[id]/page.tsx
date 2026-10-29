import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarReais } from "@/lib/honorarios/tabela";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { enviarCalculoAction } from "../actions";

export const metadata = { title: "Cálculo" };
export const dynamic = "force-dynamic";

type Totais = { valorOriginal: number; valorCorrigido: number; juros: number; total: number };

export default async function PaginaCalculo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const sessao = await exigirSessao();
  const { id } = await params;
  const { erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const { data: c } = await supabase
    .from("calculos")
    .select("id, titulo, regra_codigo, status, resultado, memoria")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();
  const { data: itens } = await supabase
    .from("calculo_itens")
    .select("ordem, descricao, data_inicial, valor_original, valor_corrigido, juros, total")
    .eq("calculo_id", id)
    .order("ordem");
  const { data: regra } = await supabase
    .schema("ref")
    .from("regras_juros")
    .select("nome, a_confirmar")
    .eq("codigo", c.regra_codigo as string)
    .maybeSingle();
  const totais = (c.resultado as { totais?: Totais } | null)?.totais;
  const memoria = (c.memoria as { descricao: string; passos: { texto: string }[] }[] | null) ?? [];
  const status = c.status as string;
  const podeEnviar = ["socio", "advogado"].includes(sessao.papel) && status === "rascunho" && Boolean(totais);
  const enviar = enviarCalculoAction.bind(null, id);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/calculos" className="text-sm text-zinc-500 hover:underline">
          ← Cálculos
        </Link>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          {c.titulo as string}
          <Badge tom={status === "aprovado" ? "sucesso" : status === "rejeitado" ? "perigo" : "info"}>{status}</Badge>
        </h1>
        <p className="text-sm text-zinc-500">
          Regra: {regra?.nome ?? (c.regra_codigo as string)}
          {regra?.a_confirmar ? " · regra a confirmar pela advogada" : ""}
        </p>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Resultado</CardTitle>
          <CardDescription>
            {totais
              ? `Total atualizado: ${formatarReais(totais.total)} (principal ${formatarReais(totais.valorOriginal)}, correção ${formatarReais(totais.valorCorrigido - totais.valorOriginal)}, juros ${formatarReais(totais.juros)})`
              : "Sem resultado."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH>Data inicial</TH>
                <TH>Principal</TH>
                <TH>Corrigido</TH>
                <TH>Juros</TH>
                <TH>Total</TH>
              </TR>
            </THead>
            <TBody>
              {(itens ?? []).map((i) => (
                <TR key={i.ordem as number}>
                  <TD>{i.descricao as string}</TD>
                  <TD>{String(i.data_inicial)}</TD>
                  <TD>{formatarReais(Number(i.valor_original))}</TD>
                  <TD>{formatarReais(Number(i.valor_corrigido))}</TD>
                  <TD>{formatarReais(Number(i.juros))}</TD>
                  <TD>{formatarReais(Number(i.total))}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <details>
            <summary className="cursor-pointer text-sm text-zinc-500">Memória de cálculo</summary>
            <ul className="mt-2 flex flex-col gap-2 text-xs">
              {memoria.map((m) => (
                <li key={m.descricao}>
                  <strong>{m.descricao}</strong>
                  <ul className="list-disc pl-5">
                    {m.passos.map((p, k) => (
                      <li key={k}>{p.texto}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </details>
          {podeEnviar ? (
            <form action={enviar} className="flex justify-end">
              <Button type="submit">Enviar para aprovação</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
