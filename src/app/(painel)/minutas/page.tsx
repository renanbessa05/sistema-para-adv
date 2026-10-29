import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMinutas, ROTULO_STATUS_MINUTA } from "@/server/minutas";
import { ROTULO_AREA, ROTULO_TIPO_PECA } from "@/lib/ia/schemas/minutas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatarData } from "@/lib/utils";

export const metadata = { title: "Peças" };
export const dynamic = "force-dynamic";

const TOM: Record<string, "info" | "sucesso" | "alerta" | "perigo" | "neutro"> = { rascunho: "neutro", em_etapas: "info", redigida: "info", em_revisao_ia: "info", aguardando_aprovacao: "alerta", devolvida: "perigo", aprovada: "sucesso", protocolada: "sucesso", arquivada: "neutro", cancelada: "neutro" };

export default async function PaginaMinutas({ searchParams }: { searchParams: Promise<{ status?: string; erro?: string; ok?: string }> }) {
  await exigirSessao();
  const { status, erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const minutas = await listarMinutas(supabase, { status: status || undefined });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Peças</h1>
          <p className="text-sm text-zinc-500">Minutas conduzidas em seis etapas com aprovação (caso novo), revisão de rascunho ou redação direta, e varredura dos autos de processo em curso.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/varreduras/nova" className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Varredura dos autos
          </Link>
          <Link href="/minutas/nova" className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-4 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900">
            Nova minuta
          </Link>
        </div>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      <div className="flex flex-wrap gap-1 text-sm">
        {["", "em_etapas", "redigida", "aguardando_aprovacao", "devolvida", "aprovada", "protocolada"].map((s) => (
          <Link key={s || "todos"} href={s ? `/minutas?status=${s}` : "/minutas"} className={`rounded-md px-2 py-1 ${(status ?? "") === s ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
            {s ? ROTULO_STATUS_MINUTA[s] : "Todas"}
          </Link>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{minutas.length} minuta(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {minutas.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma minuta.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Título</TH>
                  <TH>Peça</TH>
                  <TH>Processo</TH>
                  <TH>Etapa</TH>
                  <TH>Status</TH>
                  <TH>Atualizada</TH>
                </TR>
              </THead>
              <TBody>
                {minutas.map((m) => (
                  <TR key={m.id}>
                    <TD>
                      <Link href={`/minutas/${m.id}`} className="hover:underline">
                        {m.titulo}
                      </Link>
                    </TD>
                    <TD>
                      {ROTULO_TIPO_PECA[m.tipo_peca]} · {ROTULO_AREA[m.area]} · modo {m.modo}
                    </TD>
                    <TD className="font-mono text-xs">{m.processo_numero ?? "—"}</TD>
                    <TD>{m.modo === "C" ? `${Math.min(m.etapa_atual, 6)}/6` : "redação"}</TD>
                    <TD>
                      <Badge tom={TOM[m.status] ?? "neutro"}>{ROTULO_STATUS_MINUTA[m.status] ?? m.status}</Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-zinc-500">{formatarData(m.atualizado_em.slice(0, 10))}</TD>
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
