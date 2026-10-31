import { criarClienteServidor } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { adicionarDias, hojeNoFuso } from "@/lib/prazos";
import { formatarData } from "@/lib/utils";
import { Cartao } from "./Cartao";

/** Visão do sócio: uso, acerto da IA e custo nos últimos 30 dias. Dados da view materializada (atualizada às 3h) + custo do mês em tempo real. */
export async function MetricasTrintaDias() {
  const supabase = await criarClienteServidor();
  const hoje = hojeNoFuso("America/Cuiaba");
  const { data: linhas } = await supabase.rpc("metricas_do_escritorio", { p_de: adicionarDias(hoje, -30), p_ate: hoje });
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const { data: execucoes } = await supabase.from("ia_execucoes").select("agente, custo_estimado, status").gte("criado_em", `${inicioMes}T00:00:00-04:00`);

  const custoPorAgente = new Map<string, { custo: number; chamadas: number; erros: number }>();
  for (const e of execucoes ?? []) {
    const a = custoPorAgente.get(e.agente) ?? { custo: 0, chamadas: 0, erros: 0 };
    a.custo += Number(e.custo_estimado ?? 0);
    a.chamadas += 1;
    if (e.status !== "ok") a.erros += 1;
    custoPorAgente.set(e.agente, a);
  }
  const custoMes = [...custoPorAgente.values()].reduce((s, a) => s + a.custo, 0);
  const metricas = (linhas ?? []) as Record<string, number | string | null>[];
  const soma = (campo: string) => metricas.reduce((s, m) => s + Number(m[campo] ?? 0), 0);
  const media = (campo: string) => {
    const v = metricas.map((m) => m[campo]).filter((x) => x !== null && x !== undefined).map(Number);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(0)}%`);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight text-marca-900">Métricas (últimos 30 dias)</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao titulo="Publicações captadas" valor={String(soma("publicacoes_captadas"))} />
        <Cartao titulo="Prazos confirmados" valor={String(soma("prazos_confirmados"))} />
        <Cartao titulo="Acerto da data sugerida" valor={pct(media("acerto_data_ia"))} />
        <Cartao titulo="Custo de IA no mês (US$)" valor={custoMes.toFixed(2)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Custo por agente no mês</CardTitle>
          <CardDescription>Cada chamada ao modelo grava tokens e custo pela tabela de preços vigente.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Agente</TH>
                <TH>Chamadas</TH>
                <TH>Erros</TH>
                <TH>Custo (US$)</TH>
              </TR>
            </THead>
            <TBody>
              {[...custoPorAgente.entries()].map(([agente, a]) => (
                <TR key={agente}>
                  <TD className="font-mono text-xs">{agente}</TD>
                  <TD>{a.chamadas}</TD>
                  <TD>{a.erros}</TD>
                  <TD>{a.custo.toFixed(4)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Por dia</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Dia</TH>
                <TH>Captadas</TH>
                <TH>Tratadas</TH>
                <TH>Prazos sugeridos</TH>
                <TH>Confirmados</TH>
                <TH>Acerto data</TH>
                <TH>Acerto tipo</TH>
                <TH>Tarefas criadas</TH>
                <TH>Concluídas</TH>
                <TH>Custo IA</TH>
              </TR>
            </THead>
            <TBody>
              {metricas.map((m) => (
                <TR key={String(m.dia)}>
                  <TD>{formatarData(String(m.dia))}</TD>
                  <TD>{m.publicacoes_captadas ?? 0}</TD>
                  <TD>{m.publicacoes_tratadas ?? 0}</TD>
                  <TD>{m.prazos_sugeridos ?? 0}</TD>
                  <TD>{m.prazos_confirmados ?? 0}</TD>
                  <TD>{pct(m.acerto_data_ia === null || m.acerto_data_ia === undefined ? null : Number(m.acerto_data_ia))}</TD>
                  <TD>{pct(m.acerto_tipo_ia === null || m.acerto_tipo_ia === undefined ? null : Number(m.acerto_tipo_ia))}</TD>
                  <TD>{m.tarefas_criadas ?? 0}</TD>
                  <TD>{m.tarefas_concluidas ?? 0}</TD>
                  <TD>{Number(m.custo_ia_total ?? 0).toFixed(4)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
