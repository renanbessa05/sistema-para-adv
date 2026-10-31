import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/server";
import { hojeNoFuso } from "@/lib/prazos";
import { competenciaValida, mesAnterior, primeiroDiaDoMes, resumirPorUsuario, rotuloMes, totaisDoPeriodo } from "@/lib/relatorios/agregar";
import { produtividadeDoPeriodo } from "@/server/relatorios";
import { GraficoBarras } from "@/components/graficos/barras";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Cartao } from "./Cartao";

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(0)}%`);

/** Produtividade por pessoa no mês escolhido (`mes` = AAAA-MM). Sócio e advogado; a página esconde a aba dos demais. */
export async function ProdutividadeMes({ base, mes }: { base: string; mes?: string }) {
  const hoje = hojeNoFuso("America/Cuiaba");
  const competencia = mes && competenciaValida(mes) ? primeiroDiaDoMes(`${mes}-01`) : primeiroDiaDoMes(hoje);
  const atual = primeiroDiaDoMes(hoje);

  const supabase = await criarClienteServidor();
  const linhas = await produtividadeDoPeriodo(supabase, competencia, competencia).catch((e: Error) => {
    return { erro: e.message } as const;
  });
  const erro = !Array.isArray(linhas) ? linhas.erro : null;
  const resumo = Array.isArray(linhas) ? resumirPorUsuario(linhas) : [];
  const totais = totaisDoPeriodo(resumo);
  const mesParam = competencia.slice(0, 7);
  const grafico = resumo.map((r) => ({ pessoa: r.nome, Concluídas: r.tarefasConcluidas, "Prazos cumpridos": r.prazosCumpridos, "Prazos vencidos": r.prazosVencidos }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-marca-900">Produtividade por pessoa</h2>
        <nav className="flex gap-2 text-sm">
          <Link className="rounded-md border px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" href={`${base}&mes=${mesAnterior(competencia).slice(0, 7)}`}>
            Mês anterior
          </Link>
          {competencia !== atual ? (
            <Link className="rounded-md border px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" href={base}>
              Mês atual
            </Link>
          ) : null}
          <a className="rounded-md border px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" href={`/api/relatorios/csv?mes=${mesParam}`}>
            Baixar CSV
          </a>
        </nav>
      </div>
      <p className="text-sm text-zinc-500">
        {rotuloMes(competencia)}. Dados da view materializada (atualizada às 3h, horário de Cuiabá). Processos em segredo de justiça aparecem só para o sócio.
      </p>

      {erro ? <Alert tom="perigo">{erro}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao titulo="Tarefas concluídas" valor={String(totais.tarefasConcluidas)} />
        <Cartao titulo="Prazos cumpridos" valor={String(totais.prazosCumpridos)} />
        <Cartao titulo="Prazos vencidos" valor={String(totais.prazosVencidos)} />
        <Cartao titulo="Taxa de cumprimento (a confirmar)" valor={pct(totais.taxaCumprimento)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Por pessoa</CardTitle>
          <CardDescription>Tarefas concluídas e prazos cumpridos ou vencidos no mês. Prazos vencidos entram no nome do responsável.</CardDescription>
        </CardHeader>
        <CardContent>
          {resumo.length ? <GraficoBarras dados={grafico} categoria="pessoa" series={[{ chave: "Concluídas", rotulo: "Concluídas", cor: "#2563eb" }, { chave: "Prazos cumpridos", rotulo: "Prazos cumpridos", cor: "#16a34a" }, { chave: "Prazos vencidos", rotulo: "Prazos vencidos", cor: "#dc2626" }]} /> : <p className="text-sm text-zinc-500">Sem atividade registrada neste mês.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tabela</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Pessoa</TH>
                <TH>Tarefas</TH>
                <TH>Prazos confirmados</TH>
                <TH>Cumpridos</TH>
                <TH>Vencidos</TH>
                <TH>Taxa</TH>
                <TH>Publicações tratadas</TH>
                <TH>Aprovações</TH>
                <TH>Revisão média (s)</TH>
              </TR>
            </THead>
            <TBody>
              {resumo.map((r) => (
                <TR key={r.usuarioId}>
                  <TD>{r.nome}</TD>
                  <TD>{r.tarefasConcluidas}</TD>
                  <TD>{r.prazosConfirmados}</TD>
                  <TD>{r.prazosCumpridos}</TD>
                  <TD>{r.prazosVencidos}</TD>
                  <TD>{pct(r.taxaCumprimento)}</TD>
                  <TD>{r.publicacoesTratadas}</TD>
                  <TD>{r.aprovacoesDecididas}</TD>
                  <TD>{r.tempoRevisaoMedioS ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
