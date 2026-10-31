import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calculator } from "lucide-react";
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
  const celulaNumero = "text-right tabular-nums whitespace-nowrap";
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex flex-col gap-1">
          <Link href="/calculos" className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-500 hover:text-marca-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Cálculos
          </Link>
          <h1 className="flex flex-wrap items-center gap-2.5 text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">
            <span className="min-w-0 break-words">{c.titulo as string}</span>
            <Badge tom={status === "aprovado" ? "sucesso" : status === "rejeitado" ? "perigo" : "info"}>{status}</Badge>
          </h1>
          <p className="text-sm text-zinc-500">
            Regra: {regra?.nome ?? (c.regra_codigo as string)}
            {regra?.a_confirmar ? <span className="font-semibold text-ouro-700"> · regra a confirmar pela advogada</span> : ""}
          </p>
        </div>
        {podeEnviar ? (
          <form action={enviar}>
            <Button type="submit">Enviar para aprovação</Button>
          </form>
        ) : null}
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-marca-600" aria-hidden />
            Resultado
          </CardTitle>
          <CardDescription className="tabular-nums">
            {totais
              ? `Total atualizado: ${formatarReais(totais.total)} (principal ${formatarReais(totais.valorOriginal)}, correção ${formatarReais(totais.valorCorrigido - totais.valorOriginal)}, juros ${formatarReais(totais.juros)})`
              : "Sem resultado."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {totais ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Indicador titulo="Principal" valor={formatarReais(totais.valorOriginal)} />
              <Indicador titulo="Correção" valor={formatarReais(totais.valorCorrigido - totais.valorOriginal)} />
              <Indicador titulo="Juros" valor={formatarReais(totais.juros)} />
              <Indicador titulo="Total atualizado" valor={formatarReais(totais.total)} destaque />
            </div>
          ) : null}
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH>Data inicial</TH>
                <TH className="text-right">Principal</TH>
                <TH className="text-right">Corrigido</TH>
                <TH className="text-right">Juros</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {(itens ?? []).map((i) => (
                <TR key={i.ordem as number}>
                  <TD className="min-w-[180px] font-semibold text-zinc-950">{i.descricao as string}</TD>
                  <TD className="text-zinc-600 tabular-nums whitespace-nowrap">{String(i.data_inicial)}</TD>
                  <TD className={celulaNumero}>{formatarReais(Number(i.valor_original))}</TD>
                  <TD className={celulaNumero}>{formatarReais(Number(i.valor_corrigido))}</TD>
                  <TD className={celulaNumero}>{formatarReais(Number(i.juros))}</TD>
                  <TD className={`${celulaNumero} font-semibold text-zinc-950`}>{formatarReais(Number(i.total))}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <details className="group rounded-xl border border-zinc-200 bg-zinc-50/50">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-zinc-700 hover:text-zinc-950 [&::-webkit-details-marker]:hidden">
                Memória de cálculo
                <span className="ml-auto text-xs font-normal text-zinc-400 group-open:hidden">abrir</span>
                <span className="ml-auto hidden text-xs font-normal text-zinc-400 group-open:inline">fechar</span>
              </summary>
              <ul className="flex flex-col gap-3 border-t border-zinc-200 px-4 py-3 text-xs leading-relaxed text-zinc-700">
                {memoria.map((m) => (
                  <li key={m.descricao} className="min-w-0">
                    <strong className="text-zinc-950">{m.descricao}</strong>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 tabular-nums">
                      {m.passos.map((p, k) => (
                        <li key={k}>{p.texto}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </details>
        </CardContent>
      </Card>
    </div>
  );
}

function Indicador({ titulo, valor, destaque = false }: { titulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={destaque ? "min-w-0 rounded-xl border border-marca-200 bg-marca-50 px-3.5 py-3" : "min-w-0 rounded-xl border border-zinc-200 bg-zinc-50/60 px-3.5 py-3"}>
      <p className="text-[11px] font-bold tracking-[0.06em] text-zinc-500 uppercase">{titulo}</p>
      <p className={`mt-1 truncate text-[17px] font-extrabold tracking-[-0.02em] tabular-nums ${destaque ? "text-marca-800" : "text-zinc-950"}`}>{valor}</p>
    </div>
  );
}
