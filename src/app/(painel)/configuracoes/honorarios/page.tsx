import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { fatoresDoEscritorio, listarTabelas, tabelaVigente } from "@/server/contratos";
import { NavegacaoConfiguracoes } from "../navegacao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Campo, GrupoCampos, Input } from "@/components/ui/input";
import { formatarData } from "@/lib/utils";
import { cadastrarTabelaAction, salvarFatoresAction } from "./actions";

export const metadata = { title: "Honorários" };
export const dynamic = "force-dynamic";

export default async function PaginaHonorarios({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") redirect("/configuracoes");
  const { erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const [fatores, tabelas, vigente] = await Promise.all([fatoresDoEscritorio(supabase, sessao.escritorioId), listarTabelas(supabase, "MT"), tabelaVigente(supabase, "MT")]);
  return (
    <div className="flex flex-col gap-4">
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes/honorarios" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Honorários</h1>
          <p className="text-sm text-zinc-500">Tabela da OAB/MT vigente e fatores de complexidade usados no cálculo dos honorários.</p>
        </div>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Fatores de complexidade</CardTitle>
          <CardDescription>Multiplicam o maior entre o piso da OAB/MT e o percentual sobre o proveito. A skill exige o fator mas não o define: calibre com a prática do escritório.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={salvarFatoresAction} className="flex flex-col gap-4">
            <GrupoCampos titulo="Multiplicadores" colunas={3}>
              <Campo label="Baixa">
                <Input name="baixa" defaultValue={String(fatores.baixa)} inputMode="decimal" />
              </Campo>
              <Campo label="Média">
                <Input name="media" defaultValue={String(fatores.media)} inputMode="decimal" />
              </Campo>
              <Campo label="Alta">
                <Input name="alta" defaultValue={String(fatores.alta)} inputMode="decimal" />
              </Campo>
            </GrupoCampos>
            <div className="flex justify-end">
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tabela OAB/MT</CardTitle>
          <CardDescription>{vigente ? `Vigente: URH R$ ${vigente.valorUrh.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} desde ${formatarData(vigente.vigenciaInicio)} (${vigente.itens.length} rubricas). Tabela com mais de 12 meses bloqueia o cálculo.` : "Nenhuma tabela cadastrada."}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {tabelas.length ? (
            <ul className="divide-y divide-zinc-100 text-sm">
              {tabelas.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 tabular-nums">
                  <span className="font-semibold text-zinc-950">{formatarData(t.vigencia_inicio)}</span>
                  <span className="text-zinc-500">· URH R$ {t.valor_urh.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  <span className="text-zinc-500">· {t.itens} rubricas</span>
                </li>
              ))}
            </ul>
          ) : null}
          <form action={cadastrarTabelaAction} className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
            <GrupoCampos titulo="Nova tabela" descricao="Cadastre a tabela do ano assim que a OAB/MT publicar o novo valor da URH." colunas={3}>
              <Campo label="Vigência (data)">
                <Input name="vigencia_inicio" type="date" required />
              </Campo>
              <Campo label="Valor da URH (R$)">
                <Input name="valor_urh" inputMode="decimal" required />
              </Campo>
              <Campo label="Fonte (URL da OAB/MT)">
                <Input name="fonte_url" placeholder="https://…" />
              </Campo>
            </GrupoCampos>
            <p className="text-xs text-zinc-500">As rubricas são copiadas da tabela anterior (os múltiplos raramente mudam). Confira a tabela publicada pela OAB/MT; divergências se corrigem em src/lib/honorarios/tabela-oab-mt.ts.</p>
            <div className="flex justify-end">
              <Button type="submit" variante="secundaria">
                Cadastrar tabela do ano
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
