import Link from "next/link";
import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Vazio } from "@/components/ui/alert";
import { cn, formatarData, formatarDataHora } from "@/lib/utils";

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

/** Diferença em dias civis entre duas datas ISO (b - a). */
function diasEntre(a: string, b: string): number {
  const [a1, a2, a3] = a.split("-").map(Number);
  const [b1, b2, b3] = b.split("-").map(Number);
  return Math.round((Date.UTC(b1, b2 - 1, b3) - Date.UTC(a1, a2 - 1, a3)) / 86_400_000);
}

/** Badge do próximo prazo fatal: vermelho vencido/hoje, âmbar até 3 dias, azul depois. */
function BadgePrazo({ prazo, hoje }: { prazo: NonNullable<LinhaProcesso["proximoPrazo"]>; hoje: string }) {
  const dias = diasEntre(hoje, prazo.data_final);
  const vencido = prazo.status === "vencido" || dias < 0;
  const tom = vencido || dias === 0 ? "perigo" : dias <= 3 ? "alerta" : "info";
  const sufixo = vencido ? " · vencido" : dias === 0 ? " · hoje" : dias > 0 && dias <= 3 ? ` · ${dias}d` : "";
  return (
    <Badge tom={tom}>
      {formatarData(prazo.data_final)}
      {sufixo}
    </Badge>
  );
}

const Traco = () => <span className="text-zinc-300">—</span>;

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
          <TH className="hidden md:table-cell">Cliente</TH>
          <TH className="hidden lg:table-cell">Comarca</TH>
          <TH className="hidden lg:table-cell">Responsável</TH>
          <TH>Status</TH>
          <TH className="hidden xl:table-cell">Última movimentação</TH>
          <TH>Próximo prazo fatal</TH>
        </TR>
      </THead>
      <TBody>
        {linhas.map((p) => (
          <TR key={p.id}>
            <TD className="min-w-[13rem]">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link href={`/processos/${p.id}`} className="font-mono text-xs font-semibold text-zinc-950 hover:text-marca-700 sm:text-[13px]">
                  {p.numero_cnj_mascara ?? "(sem número)"}
                </Link>
                {p.segredo_justica ? (
                  <Badge tom="perigo">
                    <Lock className="h-3 w-3" aria-hidden />
                    sigiloso
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-xs text-zinc-500 md:hidden" title={p.cliente ?? undefined}>
                {p.cliente ?? "sem cliente"}
                {p.comarca ? ` · ${p.comarca}` : ""}
              </p>
            </TD>
            <TD className={cn("hidden max-w-[16rem] md:table-cell", p.cliente ? "font-medium text-zinc-800" : undefined)}>
              <span className="block truncate" title={p.cliente ?? undefined}>
                {p.cliente ?? <Traco />}
              </span>
            </TD>
            <TD className="hidden text-zinc-600 lg:table-cell">{p.comarca ?? <Traco />}</TD>
            <TD className="hidden text-zinc-600 lg:table-cell">{p.responsavel ?? <span className="text-zinc-400">sem responsável</span>}</TD>
            <TD>
              <Badge tom={TOM_STATUS[p.status] ?? "neutro"}>{ROTULO_STATUS[p.status] ?? p.status}</Badge>
            </TD>
            <TD className="hidden max-w-xs xl:table-cell">
              {p.ultimaMovimentacao ? (
                <span className="block truncate text-xs text-zinc-600" title={p.ultimaMovimentacao.nome}>
                  <span className="text-zinc-400 tabular-nums">{formatarDataHora(p.ultimaMovimentacao.data, timeZone).slice(0, 10)}</span> · {p.ultimaMovimentacao.nome}
                </span>
              ) : (
                <Traco />
              )}
            </TD>
            <TD>
              {p.proximoPrazo ? (
                <span className="flex items-center gap-2">
                  <BadgePrazo prazo={p.proximoPrazo} hoje={hoje} />
                  {p.proximoPrazo.ato_descricao ? (
                    <span className="hidden max-w-[14rem] truncate text-xs text-zinc-500 lg:inline" title={p.proximoPrazo.ato_descricao}>
                      {p.proximoPrazo.ato_descricao}
                    </span>
                  ) : null}
                </span>
              ) : (
                <Traco />
              )}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
