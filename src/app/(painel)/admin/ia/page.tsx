import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { envServidor } from "@/lib/config/env";
import { percentualAlerta } from "@/lib/ia/monitoramento";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Custo de IA" };

/** Visão do sócio: custo por agente no mês, cache, teto, alerta e as últimas avaliações (scripts/avaliar-agente.ts). */
export default async function PaginaIa() {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") redirect("/hoje");
  const supabase = await criarClienteServidor();

  const [{ data: custos }, { data: configs }, { data: avaliacoes }] = await Promise.all([
    supabase.rpc("ia_custos_do_escritorio", { p_escritorio: sessao.escritorioId }),
    supabase.from("escritorio_configuracoes").select("chave, valor").eq("escritorio_id", sessao.escritorioId).in("chave", ["ia.teto_mensal_usd", "ia.alerta_percentual"]),
    supabase.from("ia_avaliacoes").select("agente, agente_versao, modo, modelo, total_casos, casos_ok, situacao, criado_em").order("criado_em", { ascending: false }).limit(20),
  ]);

  const linhas = (custos ?? []) as {
    agente: string;
    chamadas: number | string;
    erros: number | string;
    input_tokens: number | string;
    output_tokens: number | string;
    cache_leitura_tokens: number | string;
    custo_usd: number | string;
    taxa_cache_hit: number | string | null;
  }[];
  const config = new Map((configs ?? []).map((c) => [c.chave as string, c.valor]));
  const tetoConfig = config.get("ia.teto_mensal_usd");
  const teto = typeof tetoConfig === "number" ? tetoConfig : envServidor().IA_TETO_MENSAL_USD;
  const alerta = percentualAlerta(config.get("ia.alerta_percentual"));
  const gasto = linhas.reduce((s, l) => s + Number(l.custo_usd), 0);
  const fracao = teto > 0 ? gasto / teto : 0;
  const pct = (v: number | string | null) => (v === null ? "—" : `${(Number(v) * 100).toFixed(1)}%`);
  const data = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Cuiaba" });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Custo de IA (mês corrente)</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao titulo="Gasto no mês (US$)" valor={gasto.toFixed(2)} />
        <Cartao titulo="Teto mensal (US$)" valor={teto.toFixed(2)} />
        <Cartao titulo="Uso do teto" valor={`${(fracao * 100).toFixed(0)}%`} />
        <Cartao titulo="Alerta a partir de" valor={`${alerta}%`} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Por agente no mês</CardTitle>
          <CardDescription>
            Execuções registradas em ia_execucoes. Taxa de cache = leitura do cache sobre o total de tokens de entrada. Teto configurável em escritorio_configuracoes (ia.teto_mensal_usd); sem valor, usa o padrão do ambiente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Agente</TH>
                <TH>Chamadas</TH>
                <TH>Erros</TH>
                <TH>Entrada</TH>
                <TH>Saída</TH>
                <TH>Cache (taxa)</TH>
                <TH>Custo (US$)</TH>
              </TR>
            </THead>
            <TBody>
              {linhas.map((l) => (
                <TR key={l.agente}>
                  <TD className="font-mono text-xs">{l.agente}</TD>
                  <TD>{Number(l.chamadas)}</TD>
                  <TD>{Number(l.erros)}</TD>
                  <TD>{Number(l.input_tokens)}</TD>
                  <TD>{Number(l.output_tokens)}</TD>
                  <TD>{pct(l.taxa_cache_hit)}</TD>
                  <TD>{Number(l.custo_usd).toFixed(4)}</TD>
                </TR>
              ))}
              {linhas.length === 0 ? (
                <TR>
                  <TD colSpan={7} className="text-zinc-500">Nenhuma execução de IA neste mês.</TD>
                </TR>
              ) : null}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Últimas avaliações de agentes</CardTitle>
          <CardDescription>Gravadas com scripts/avaliar-agente.ts --gravar. Modo falso não chama a API; só o modo real mede o modelo.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Quando</TH>
                <TH>Agente</TH>
                <TH>Versão</TH>
                <TH>Modo</TH>
                <TH>Casos OK</TH>
                <TH>Situação</TH>
              </TR>
            </THead>
            <TBody>
              {(avaliacoes ?? []).map((a) => (
                <TR key={`${a.criado_em}-${a.agente}`}>
                  <TD>{data(a.criado_em as string)}</TD>
                  <TD className="font-mono text-xs">{a.agente}</TD>
                  <TD className="font-mono text-xs">{a.agente_versao}</TD>
                  <TD>{a.modo}</TD>
                  <TD>{`${a.casos_ok}/${a.total_casos}`}</TD>
                  <TD>{a.situacao}</TD>
                </TR>
              ))}
              {(avaliacoes ?? []).length === 0 ? (
                <TR>
                  <TD colSpan={6} className="text-zinc-500">Nenhuma avaliação gravada.</TD>
                </TR>
              ) : null}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Cartao({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-zinc-500">{titulo}</p>
        <p className="text-3xl font-semibold">{valor}</p>
      </CardContent>
    </Card>
  );
}
