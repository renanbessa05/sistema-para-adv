import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Vazio } from "@/components/ui/alert";
import { formatarData, formatarDataHora } from "@/lib/utils";

export interface LinhaProcesso {
  id: string;
  numero_cnj_mascara: string | null;
  status: string;
  segredo_justica: boolean;
  responsavel: string | null;
  cliente: string | null;
  comarca: string | null;
  ultimaMovimentacao: { nome: string; data: string } | null;
  proximoPrazo: { data_final: string; status: string; ato_descricao: string | null } | null;
}

const ROTULO_STATUS: Record<string, string> = { ativo: "Ativo", suspenso: "Suspenso", arquivado: "Arquivado", baixado: "Baixado" };
const TOM_STATUS: Record<string, "sucesso" | "alerta" | "neutro"> = { ativo: "sucesso", suspenso: "alerta", arquivado: "neutro", baixado: "neutro" };

/** Tabela de processos (server component). Recebe linhas já montadas pela página. */
export function ListaProcessos({ linhas, hoje, timeZone }: { linhas: LinhaProcesso[]; hoje: string; timeZone?: string }) {
  if (linhas.length === 0) {
    return <Vazio titulo="Nenhum processo encontrado" descricao="Ajuste os filtros ou cadastre um processo novo." />;
  }
  return (
    <Table>
      <THead>
        <TR>
          <TH>Número</TH>
          <TH>Cliente</TH>
          <TH>Comarca</TH>
          <TH>Responsável</TH>
          <TH>Status</TH>
          <TH>Última movimentação</TH>
          <TH>Próximo prazo fatal</TH>
        </TR>
      </THead>
      <TBody>
        {linhas.map((p) => (
          <TR key={p.id}>
            <TD>
              <Link href={`/processos/${p.id}`} className="font-mono text-xs hover:underline sm:text-sm">
                {p.numero_cnj_mascara ?? "(sem número)"}
              </Link>
              {p.segredo_justica ? (
                <Badge tom="perigo" className="ml-2">
                  sigiloso
                </Badge>
              ) : null}
            </TD>
            <TD>{p.cliente ?? <span className="text-zinc-400">—</span>}</TD>
            <TD>{p.comarca ?? <span className="text-zinc-400">—</span>}</TD>
            <TD>{p.responsavel ?? <span className="text-zinc-400">sem responsável</span>}</TD>
            <TD>
              <Badge tom={TOM_STATUS[p.status] ?? "neutro"}>{ROTULO_STATUS[p.status] ?? p.status}</Badge>
            </TD>
            <TD className="max-w-xs">
              {p.ultimaMovimentacao ? (
                <span className="block truncate text-xs" title={p.ultimaMovimentacao.nome}>
                  <span className="text-zinc-500">{formatarDataHora(p.ultimaMovimentacao.data, timeZone).slice(0, 10)}</span> · {p.ultimaMovimentacao.nome}
                </span>
              ) : (
                <span className="text-zinc-400">—</span>
              )}
            </TD>
            <TD>
              {p.proximoPrazo ? (
                <span className="flex items-center gap-1">
                  <Badge tom={p.proximoPrazo.status === "vencido" || p.proximoPrazo.data_final < hoje ? "perigo" : p.proximoPrazo.data_final === hoje ? "alerta" : "info"}>{formatarData(p.proximoPrazo.data_final)}</Badge>
                  {p.proximoPrazo.ato_descricao ? <span className="hidden text-xs text-zinc-500 lg:inline">{p.proximoPrazo.ato_descricao}</span> : null}
                </span>
              ) : (
                <span className="text-zinc-400">—</span>
              )}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
