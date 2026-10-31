import Link from "next/link";
import { ArrowLeft, Calculator } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarRegras } from "@/server/calculos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button, classesBotao } from "@/components/ui/button";
import { Campo, GrupoCampos, Input, Select, Textarea } from "@/components/ui/input";
import { novoCalculoAction } from "../actions";

export const metadata = { title: "Novo cálculo" };
export const dynamic = "force-dynamic";

export default async function PaginaNovoCalculo({ searchParams }: { searchParams: Promise<{ erro?: string; processo?: string }> }) {
  await exigirSessao();
  const { erro, processo } = await searchParams;
  const supabase = await criarClienteServidor();
  const [regras, { data: processos }] = await Promise.all([
    listarRegras(supabase),
    supabase.from("processos").select("id, numero_cnj_mascara").order("atualizado_em", { ascending: false }).limit(300),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex flex-col gap-1">
          <Link href="/calculos" className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-500 hover:text-marca-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Cálculos
          </Link>
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Novo cálculo</h1>
          <p className="text-sm text-zinc-500">Atualização monetária e juros por item, com memória de cálculo.</p>
        </div>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-marca-600" aria-hidden />
            Dados do cálculo
          </CardTitle>
          <CardDescription>
            Um item por linha: descrição;AAAA-MM-DD;valor. A data é a do início da correção (vencimento ou citação).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={novoCalculoAction} className="flex flex-col gap-5">
            <GrupoCampos titulo="Identificação">
              <Campo label="Título">
                <Input name="titulo" required />
              </Campo>
              <Campo label="Processo (opcional)">
                <Select name="processo_id" defaultValue={processo ?? ""} className="font-mono">
                  <option value="">Sem processo</option>
                  {(processos ?? []).map((p) => (
                    <option key={p.id as string} value={p.id as string}>
                      {(p.numero_cnj_mascara as string | null) ?? "sem número"}
                    </option>
                  ))}
                </Select>
              </Campo>
            </GrupoCampos>
            <GrupoCampos titulo="Regra e período">
              <Campo label="Regra de juros" dica="Regras marcadas “a confirmar” ainda dependem de revisão da advogada.">
                <Select name="regra" defaultValue="civel_pre_14905">
                  {regras.map((r) => (
                    <option key={r.codigo} value={r.codigo}>
                      {r.nome}
                      {r.a_confirmar ? " (a confirmar)" : ""}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Taxa mensal (só para regra contratual)" dica="Em percentual ao mês. Ignorada nas demais regras.">
                <Input name="taxa_informada" inputMode="decimal" placeholder="ex.: 1" className="tabular-nums" />
              </Campo>
              <Campo label="Data final da atualização">
                <Input name="data_final" type="date" required className="tabular-nums" />
              </Campo>
            </GrupoCampos>
            <GrupoCampos titulo="Itens" colunas={1}>
              <Campo label="Itens" dica="Um por linha: descrição;AAAA-MM-DD;valor. Aceita vírgula ou ponto nos centavos.">
                <Textarea name="itens" rows={6} required placeholder={"Honorários de sucumbência;2024-03-15;5000,00\nDanos materiais;2024-01-10;1.250,40"} className="font-mono text-xs" />
              </Campo>
            </GrupoCampos>
            <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-4">
              <Link href="/calculos" className={classesBotao({ variante: "contorno" })}>
                Cancelar
              </Link>
              <Button type="submit">Calcular</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
