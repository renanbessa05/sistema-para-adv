import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarRegras } from "@/server/calculos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select, Textarea } from "@/components/ui/input";
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
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/calculos" className="text-sm text-zinc-500 hover:underline">
          ← Cálculos
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Novo cálculo</h1>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Dados do cálculo</CardTitle>
          <CardDescription>
            Um item por linha: descrição;AAAA-MM-DD;valor. A data é a do início da correção (vencimento ou citação).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={novoCalculoAction} className="grid gap-3 sm:grid-cols-2">
            <Campo label="Título">
              <Input name="titulo" required />
            </Campo>
            <Campo label="Processo (opcional)">
              <Select name="processo_id" defaultValue={processo ?? ""}>
                <option value="">Sem processo</option>
                {(processos ?? []).map((p) => (
                  <option key={p.id as string} value={p.id as string}>
                    {(p.numero_cnj_mascara as string | null) ?? "sem número"}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Regra de juros">
              <Select name="regra" defaultValue="civel_pre_14905">
                {regras.map((r) => (
                  <option key={r.codigo} value={r.codigo}>
                    {r.nome}
                    {r.a_confirmar ? " (a confirmar)" : ""}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Taxa mensal (só para regra contratual)">
              <Input name="taxa_informada" inputMode="decimal" placeholder="ex.: 1" />
            </Campo>
            <Campo label="Data final da atualização">
              <Input name="data_final" type="date" required />
            </Campo>
            <Campo label="Itens" className="sm:col-span-2">
              <Textarea name="itens" rows={6} required placeholder={"Honorários de sucumbência;2024-03-15;5000,00\nDanos materiais;2024-01-10;1.250,40"} />
            </Campo>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit">Calcular</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
