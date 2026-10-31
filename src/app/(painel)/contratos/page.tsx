import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarContratos, ROTULO_STATUS_CONTRATO } from "@/server/contratos";
import { ROTULO_MODALIDADE, formatarReais } from "@/lib/honorarios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatarData } from "@/lib/utils";

export const metadata = { title: "Contratos" };
export const dynamic = "force-dynamic";

const TOM: Record<string, "info" | "sucesso" | "alerta" | "perigo" | "neutro"> = { rascunho: "neutro", aguardando_confirmacao: "alerta", confirmado: "info", aguardando_aprovacao: "alerta", aprovado: "sucesso", assinado: "sucesso", cancelado: "neutro" };

export default async function PaginaContratos({ searchParams }: { searchParams: Promise<{ status?: string; erro?: string; ok?: string }> }) {
  await exigirSessao();
  const { status, erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const contratos = await listarContratos(supabase, { status: status || undefined });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Contratos e honorários</h1>
          <p className="text-sm text-zinc-500">Entrada do caso: diagnóstico pela IA, cálculo pela Tabela OAB/MT, confirmação da advogada, documentos e aprovação.</p>
        </div>
        <Link href="/contratos/novo" className="inline-flex h-9 items-center rounded-md bg-marca-600 px-4 text-sm text-white shadow-sm hover:bg-marca-700 dark:bg-zinc-100 dark:text-zinc-900">
          Novo contrato
        </Link>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      <form method="get" className="flex flex-wrap gap-1 text-sm">
        {["", "aguardando_confirmacao", "confirmado", "aguardando_aprovacao", "aprovado", "assinado"].map((s) => (
          <Link key={s || "todos"} href={s ? `/contratos?status=${s}` : "/contratos"} className={`rounded-md px-2 py-1 ${(status ?? "") === s ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
            {s ? ROTULO_STATUS_CONTRATO[s] : "Todos"}
          </Link>
        ))}
      </form>
      <Card>
        <CardHeader>
          <CardTitle>{contratos.length} contrato(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {contratos.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhum contrato. Comece por &ldquo;Novo contrato&rdquo;.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Cliente</TH>
                  <TH>Objeto</TH>
                  <TH>Modalidade</TH>
                  <TH>Valor</TH>
                  <TH>Status</TH>
                  <TH>Atualizado</TH>
                </TR>
              </THead>
              <TBody>
                {contratos.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/contratos/${c.id}`} className="hover:underline">
                        {c.cliente_nome ?? "cliente"}
                      </Link>
                    </TD>
                    <TD className="max-w-md truncate text-zinc-600 dark:text-zinc-300">{c.objeto ?? "—"}</TD>
                    <TD>{c.modalidade ? ROTULO_MODALIDADE[c.modalidade] : "—"}</TD>
                    <TD className="whitespace-nowrap">
                      {c.valor_fixo !== null ? formatarReais(Number(c.valor_fixo)) : ""}
                      {c.percentual_exito !== null ? `${c.valor_fixo !== null ? " + " : ""}${Number(c.percentual_exito)}%` : ""}
                      {c.valor_fixo === null && c.percentual_exito === null ? "—" : ""}
                    </TD>
                    <TD>
                      <Badge tom={TOM[c.status] ?? "neutro"}>{ROTULO_STATUS_CONTRATO[c.status] ?? c.status}</Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-zinc-500">{formatarData(c.atualizado_em.slice(0, 10))}</TD>
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
