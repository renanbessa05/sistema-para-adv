import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { fatoresDoEscritorio, listarTabelas, tabelaVigente } from "@/server/contratos";
import { NavegacaoConfiguracoes } from "../navegacao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
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
      <h1 className="text-xl font-semibold">Honorários</h1>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Fatores de complexidade</CardTitle>
          <CardDescription>Multiplicam o maior entre o piso da OAB/MT e o percentual sobre o proveito. A skill exige o fator mas não o define: calibre com a prática do escritório.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={salvarFatoresAction} className="grid gap-2 sm:grid-cols-4">
            <Campo label="Baixa"><Input name="baixa" defaultValue={String(fatores.baixa)} inputMode="decimal" /></Campo>
            <Campo label="Média"><Input name="media" defaultValue={String(fatores.media)} inputMode="decimal" /></Campo>
            <Campo label="Alta"><Input name="alta" defaultValue={String(fatores.alta)} inputMode="decimal" /></Campo>
            <div className="flex items-end">
              <Button type="submit" variante="secundaria">Salvar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tabela OAB/MT</CardTitle>
          <CardDescription>{vigente ? `Vigente: URH R$ ${vigente.valorUrh.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} desde ${formatarData(vigente.vigenciaInicio)} (${vigente.itens.length} rubricas). Tabela com mais de 12 meses bloqueia o cálculo.` : "Nenhuma tabela cadastrada."}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="text-sm">
            {tabelas.map((t) => (
              <li key={t.id}>
                {formatarData(t.vigencia_inicio)} · URH R$ {t.valor_urh.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · {t.itens} rubricas
              </li>
            ))}
          </ul>
          <form action={cadastrarTabelaAction} className="grid gap-2 rounded-md border border-dashed border-zinc-300 p-2 sm:grid-cols-4 dark:border-zinc-700">
            <Campo label="Vigência (data)"><Input name="vigencia_inicio" type="date" required /></Campo>
            <Campo label="Valor da URH (R$)"><Input name="valor_urh" inputMode="decimal" required /></Campo>
            <Campo label="Fonte (URL da OAB/MT)"><Input name="fonte_url" placeholder="https://…" /></Campo>
            <div className="flex items-end">
              <Button type="submit" variante="secundaria">Cadastrar tabela do ano</Button>
            </div>
            <p className="text-xs text-zinc-500 sm:col-span-4">As rubricas são copiadas da tabela anterior (os múltiplos raramente mudam). Confira a tabela publicada pela OAB/MT; divergências se corrigem em src/lib/honorarios/tabela-oab-mt.ts.</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
