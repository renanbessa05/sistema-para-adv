import Link from "next/link";
import { Plus } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { horaLocal } from "@/lib/audiencias/datas";
import { hojeNoFuso } from "@/lib/prazos/datas";
import { formatarData } from "@/lib/utils";
import { listarAudiencias } from "@/server/audiencias";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, Vazio } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { classesBotao } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DiaAgenda, urgenciaPrazo } from "@/components/dominio/CartaoPrazo";

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
  const hoje = hojeNoFuso(tz);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Audiências</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {lista.length === 0 ? "Nenhuma marcada" : lista.length === 1 ? "1 audiência" : `${lista.length} audiências`} a partir de hoje. Alerta de véspera para o responsável e os sócios.
          </p>
        </div>
        {podeAgendar ? (
          <Link href="/audiencias/nova" className={classesBotao()}>
            <Plus aria-hidden />
            Nova audiência
          </Link>
        ) : null}
      </div>
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {lista.length === 0 ? (
            <div className="p-4">
              <Vazio titulo="Nenhuma audiência marcada a partir de hoje" descricao="Marque audiências pela tela do processo ou pelo botão acima." />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Quando</TH>
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
                  const dataIso = new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(instante);
                  const encerrada = a.status === "realizada" || a.status === "cancelada";
                  return (
                    <TR key={a.id as string}>
                      <TD className="whitespace-nowrap">
                        <span className="flex items-center gap-3">
                          <DiaAgenda data={dataIso} urgencia={encerrada ? "encerrado" : urgenciaPrazo(dataIso, hoje, "confirmado")} className="h-10 w-10" />
                          <span className="flex flex-col leading-tight">
                            <span className="font-semibold text-zinc-950 tabular-nums">{formatarData(dataIso)}</span>
                            <span className="text-xs text-zinc-500 tabular-nums">{horaLocal(instante, tz)}</span>
                          </span>
                        </span>
                      </TD>
                      <TD className="capitalize">{a.tipo as string}</TD>
                      <TD className="font-mono text-xs text-zinc-700">{processo}</TD>
                      <TD className="capitalize text-zinc-600">{a.modalidade as string}</TD>
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
