import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarDataHora } from "@/lib/utils";
import { TIPO_AGENDAMENTO_PRODUTIVIDADE, TIPO_EXPORTACAO_PRODUTIVIDADE } from "@/server/relatorios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { NavegacaoConfiguracoes } from "../navegacao";
import { alternarRelatorioMensal } from "./actions";

export const metadata = { title: "Relatórios agendados" };
export const dynamic = "force-dynamic";

/** Só sócio. Liga o CSV mensal de produtividade (gerado pela rotina relatorio-mensal; nenhum e-mail é enviado). */
export default async function PaginaRelatoriosAgendados({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") redirect("/configuracoes");
  const { erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const [{ data: agendado }, { data: exportacoes }] = await Promise.all([
    supabase.from("relatorios_agendados").select("ativo, ultima_competencia, ultima_geracao_em").eq("escritorio_id", sessao.escritorioId).eq("tipo", TIPO_AGENDAMENTO_PRODUTIVIDADE).maybeSingle(),
    supabase.from("exportacoes").select("id, linhas, gerada_em").eq("tipo", TIPO_EXPORTACAO_PRODUTIVIDADE).order("gerada_em", { ascending: false }).limit(12),
  ]);
  const ativo = Boolean(agendado?.ativo);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Configurações</h1>
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes/relatorios" />
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Relatório mensal de produtividade</CardTitle>
          <CardDescription>
            Todo dia 1, às 07h (Cuiabá), gera o CSV do mês anterior com tarefas, prazos e publicações por pessoa. O arquivo fica no armazenamento privado e só o sócio baixa. Nenhum e-mail é enviado por este recurso.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm">
            Situação: <strong>{ativo ? "ativo" : "desativado"}</strong>
            {agendado?.ultima_competencia ? ` · último mês gerado: ${String(agendado.ultima_competencia).slice(0, 7)}` : ""}
          </p>
          <form action={alternarRelatorioMensal}>
            <input type="hidden" name="ativo" value={ativo ? "0" : "1"} />
            <Button type="submit">{ativo ? "Desativar" : "Ativar"} relatório mensal</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Arquivos gerados</CardTitle>
        </CardHeader>
        <CardContent>
          {exportacoes?.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Gerado em</TH>
                  <TH>Linhas</TH>
                  <TH>Arquivo</TH>
                </TR>
              </THead>
              <TBody>
                {exportacoes.map((e) => (
                  <TR key={e.id}>
                    <TD>{formatarDataHora(e.gerada_em)}</TD>
                    <TD>{e.linhas}</TD>
                    <TD>
                      <a className="text-blue-600 hover:underline" href={`/api/relatorios/arquivo?id=${e.id}`}>
                        Baixar CSV
                      </a>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="text-sm text-zinc-500">Nenhum arquivo gerado ainda.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
