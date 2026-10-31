import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TRIBUNAIS_ESTADUAIS } from "@/lib/tribunais/codigos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Vazio } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Campo, GrupoCampos, Input, Select, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { confirmarCamadaAction } from "./actions";

export const metadata = { title: "Tribunais" };
export const dynamic = "force-dynamic";

export default async function PaginaTribunais({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sessao = await exigirSessao();
  const { ok, erro } = await searchParams;
  const supabase = await criarClienteServidor();
  const [{ data: confirmacoes }, { count: pendentes }] = await Promise.all([
    supabase.from("escritorio_camada_local").select("id, tribunal_sigla, bloco, item, fonte, confirmado_em").order("confirmado_em", { ascending: false }).limit(200),
    supabase.schema("ref").from("tribunal_camada_local").select("*", { count: "exact", head: true }).eq("tribunal_sigla", "*"),
  ]);
  const siglas = Object.values(TRIBUNAIS_ESTADUAIS).map((t) => t.sigla);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link href="/configuracoes" className="text-[13px] font-semibold text-zinc-500 hover:text-marca-700">
            ← Configurações
          </Link>
          <h1 className="mt-1 text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Camada local dos tribunais</h1>
          <p className="text-sm text-zinc-500">
            Os {pendentes ?? 0} itens-base de cada TJ fora de MT começam como “a verificar”. Só entram como confirmados os que o sócio confirma aqui, com fonte oficial.
          </p>
        </div>
      </div>
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {sessao.papel === "socio" ? (
        <Card>
          <CardHeader>
            <CardTitle>Confirmar um item</CardTitle>
            <CardDescription>A fonte é obrigatória: página do tribunal, provimento, tabela de custas ou o documento dos autos.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={confirmarCamadaAction} className="flex flex-col gap-6">
              <GrupoCampos titulo="Referência" colunas={3}>
                <Campo label="Tribunal">
                  <Select name="tribunal_sigla" defaultValue="TJSP">
                    {siglas.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </Campo>
                <Campo label="Bloco (1 a 8)" dica="Bloco da camada local a que o item pertence.">
                  <Input name="bloco" type="number" min={1} max={8} required />
                </Campo>
              </GrupoCampos>
              <GrupoCampos titulo="Confirmação" colunas={1}>
                <Campo label="Item confirmado">
                  <Textarea name="item" rows={2} required />
                </Campo>
                <Campo label="Fonte oficial">
                  <Input name="fonte" required placeholder="ex.: provimento CGJ nº ..., tabela de custas vigente, página do TJ" />
                </Campo>
              </GrupoCampos>
              <div className="flex justify-end">
                <Button type="submit">Confirmar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Confirmados pelo escritório</CardTitle>
        </CardHeader>
        <CardContent>
          {(confirmacoes ?? []).length === 0 ? (
            <Vazio titulo="Nenhum item confirmado ainda." descricao="Os itens confirmados aqui passam a valer como camada local nos processos fora de Mato Grosso." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Tribunal</TH>
                  <TH>Bloco</TH>
                  <TH>Item</TH>
                  <TH>Fonte</TH>
                  <TH>Situação</TH>
                </TR>
              </THead>
              <TBody>
                {(confirmacoes ?? []).map((c) => (
                  <TR key={c.id as string}>
                    <TD className="font-mono text-xs font-semibold text-zinc-950">{c.tribunal_sigla as string}</TD>
                    <TD className="tabular-nums">{String(c.bloco)}</TD>
                    <TD className="min-w-56">{c.item as string}</TD>
                    <TD className="text-xs text-zinc-500">{c.fonte as string}</TD>
                    <TD>
                      <Badge tom="sucesso">confirmado</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
