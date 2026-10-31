import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { horaLocal } from "@/lib/audiencias/datas";
import { formatarData } from "@/lib/utils";
import { listarAudiencias } from "@/server/audiencias";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Audiências" };
export const dynamic = "force-dynamic";

export default async function PaginaAudiencias({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const sessao = await exigirSessao();
  const { ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const { data: escritorio } = await supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).single();
  const tz = (escritorio?.timezone as string | undefined) ?? "America/Cuiaba";
  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);
  const lista = await listarAudiencias(supabase, inicioDoDia);
  const podeAgendar = ["socio", "advogado"].includes(sessao.papel);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Audiências</h1>
          <p className="text-sm text-zinc-500">A partir de hoje. Alerta de véspera para o responsável e os sócios.</p>
        </div>
        {podeAgendar ? (
          <Link href="/audiencias/nova" className="inline-flex h-9 items-center rounded-md bg-marca-600 px-4 text-sm text-white shadow-sm hover:bg-marca-700">
            Nova audiência
          </Link>
        ) : null}
      </div>
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>{lista.length} audiência(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {lista.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma audiência marcada a partir de hoje.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Data</TH>
                  <TH>Hora</TH>
                  <TH>Tipo</TH>
                  <TH>Processo</TH>
                  <TH>Modalidade</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {lista.map((a) => {
                  const instante = new Date(String(a.data_hora));
                  const processo = (a.processos as { numero_cnj_mascara?: string } | null)?.numero_cnj_mascara ?? "sem número";
                  return (
                    <TR key={a.id as string}>
                      <TD>{formatarData(new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(instante))}</TD>
                      <TD>{horaLocal(instante, tz)}</TD>
                      <TD>{a.tipo as string}</TD>
                      <TD className="font-mono text-xs">{processo}</TD>
                      <TD>{a.modalidade as string}</TD>
                      <TD>
                        <Badge tom={a.status === "realizada" ? "sucesso" : a.status === "cancelada" ? "perigo" : "info"}>{a.status as string}</Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
