import Link from "next/link";
import { Plus } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarContratos, ROTULO_STATUS_CONTRATO } from "@/server/contratos";
import { ROTULO_MODALIDADE, formatarReais } from "@/lib/honorarios";
import { Badge } from "@/components/ui/badge";
import { Alert, Vazio } from "@/components/ui/alert";
import { classesBotao } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn, formatarData } from "@/lib/utils";

export const metadata = { title: "Contratos" };
export const dynamic = "force-dynamic";

const TOM: Record<string, "info" | "sucesso" | "alerta" | "perigo" | "neutro"> = { rascunho: "neutro", aguardando_confirmacao: "alerta", confirmado: "info", aguardando_aprovacao: "alerta", aprovado: "sucesso", assinado: "sucesso", cancelado: "neutro" };

export default async function PaginaContratos({ searchParams }: { searchParams: Promise<{ status?: string; erro?: string; ok?: string }> }) {
  await exigirSessao();
  const { status, erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const contratos = await listarContratos(supabase, { status: status || undefined });
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Contratos e honorários</h1>
          <p className="text-sm text-zinc-500">Entrada do caso: diagnóstico pela IA, cálculo pela Tabela OAB/MT, confirmação da advogada, documentos e aprovação.</p>
        </div>
        <Link href="/contratos/novo" className={classesBotao({ variante: "primaria" })}>
          <Plus aria-hidden />
          Novo contrato
        </Link>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      <form method="get" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 text-sm whitespace-nowrap md:mx-0 md:px-0" aria-label="Filtrar por status">
        {["", "aguardando_confirmacao", "confirmado", "aguardando_aprovacao", "aprovado", "assinado"].map((s) => {
          const on = (status ?? "") === s;
          return (
            <Link key={s || "todos"} href={s ? `/contratos?status=${s}` : "/contratos"} aria-current={on ? "page" : undefined} className={cn("inline-flex h-8 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-semibold transition-colors", on ? "border-marca-600 bg-marca-600 text-white shadow-marca" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900")}>
              {s ? ROTULO_STATUS_CONTRATO[s] : "Todos"}
            </Link>
          );
        })}
      </form>
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3.5">
          <h2 className="text-[15px] leading-tight font-bold tracking-[-0.01em] text-zinc-950">
            <span className="tabular-nums">{contratos.length}</span> contrato(s)
          </h2>
          {status ? <Badge tom={TOM[status] ?? "neutro"}>{ROTULO_STATUS_CONTRATO[status] ?? status}</Badge> : null}
        </div>
        {contratos.length === 0 ? (
          <Vazio titulo="Nenhum contrato" descricao="Comece por “Novo contrato”: a IA diagnostica o caso e sugere os honorários pela Tabela OAB/MT." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Cliente</TH>
                <TH className="hidden md:table-cell">Objeto</TH>
                <TH className="hidden sm:table-cell">Modalidade</TH>
                <TH>Valor</TH>
                <TH>Status</TH>
                <TH className="hidden lg:table-cell">Atualizado</TH>
              </TR>
            </THead>
            <TBody>
              {contratos.map((c) => (
                <TR key={c.id}>
                  <TD className="min-w-[10rem]">
                    <Link href={`/contratos/${c.id}`} className="font-semibold text-zinc-950 hover:text-marca-700">
                      {c.cliente_nome ?? "cliente"}
                    </Link>
                    <p className="truncate text-xs text-zinc-500 md:hidden" title={c.objeto ?? undefined}>
                      {c.objeto ?? ""}
                    </p>
                  </TD>
                  <TD className="hidden max-w-md md:table-cell">
                    <span className="block truncate text-zinc-600" title={c.objeto ?? undefined}>
                      {c.objeto ?? <span className="text-zinc-300">—</span>}
                    </span>
                  </TD>
                  <TD className="hidden text-zinc-600 sm:table-cell">{c.modalidade ? ROTULO_MODALIDADE[c.modalidade] : <span className="text-zinc-300">—</span>}</TD>
                  <TD className="whitespace-nowrap font-medium tabular-nums">
                    {c.valor_fixo !== null ? formatarReais(Number(c.valor_fixo)) : ""}
                    {c.percentual_exito !== null ? `${c.valor_fixo !== null ? " + " : ""}${Number(c.percentual_exito)}%` : ""}
                    {c.valor_fixo === null && c.percentual_exito === null ? <span className="text-zinc-300">—</span> : ""}
                  </TD>
                  <TD>
                    <Badge tom={TOM[c.status] ?? "neutro"}>{ROTULO_STATUS_CONTRATO[c.status] ?? c.status}</Badge>
                  </TD>
                  <TD className="hidden whitespace-nowrap text-xs text-zinc-500 tabular-nums lg:table-cell">{formatarData(c.atualizado_em.slice(0, 10))}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
