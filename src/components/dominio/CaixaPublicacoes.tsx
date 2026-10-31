import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Vazio } from "@/components/ui/alert";
import { cn, formatarData } from "@/lib/utils";

/** Rótulos e tons das publicações (puros, usados na lista e no detalhe). */

type TomBadge = "neutro" | "info" | "sucesso" | "alerta" | "perigo" | "contorno";

export const ROTULO_STATUS_PUBLICACAO: Record<string, string> = {
  nova: "Nova",
  classificada: "Classificada",
  vinculada: "Vinculada",
  sem_processo: "Sem processo",
  com_prazo_sugerido: "Prazo sugerido",
  sem_prazo: "Sem prazo",
  tratada: "Tratada",
  ignorada: "Ignorada",
  duplicada: "Duplicada",
  arquivada: "Arquivada",
};

export const TOM_STATUS_PUBLICACAO: Record<string, TomBadge> = {
  nova: "info",
  classificada: "info",
  vinculada: "info",
  sem_processo: "alerta",
  com_prazo_sugerido: "alerta",
  sem_prazo: "neutro",
  tratada: "sucesso",
  ignorada: "neutro",
  duplicada: "neutro",
  arquivada: "contorno",
};

export const ROTULO_TIPO_PUBLICACAO: Record<string, string> = {
  intimacao: "Intimação",
  citacao: "Citação",
  despacho: "Despacho",
  decisao: "Decisão",
  sentenca: "Sentença",
  acordao: "Acórdão",
  edital: "Edital",
  pauta: "Pauta",
  outro: "Outro",
};

export const ROTULO_FONTE: Record<string, string> = {
  djen: "DJEN",
  pje_manual: "PJe (manual)",
  email_manual: "E-mail (manual)",
  datajud: "DataJud",
  pje_extensao: "PJe (extensão)",
};

/** Confiança 0..1 como percentual inteiro ("87%"); vazio quando não há. */
export function formatarConfianca(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return "";
  return `${Math.round(Number(valor) * 100)}%`;
}

/** Primeira linha do resumo, cortada em `max` caracteres. */
export function primeiraLinha(texto: string | null | undefined, max = 140): string {
  if (!texto) return "";
  const linha = texto.split(/\r?\n/)[0].trim();
  return linha.length > max ? `${linha.slice(0, max - 1)}…` : linha;
}

export interface LinhaCaixa {
  id: string;
  fonte: string;
  numero_cnj: string | null;
  numero_processo_texto: string | null;
  processo_id: string | null;
  tipo: string | null;
  status: string;
  data_disponibilizacao: string | null;
  resumo_ia: string | null;
  sugere_sigilo: boolean;
  revisar_classificacao: boolean;
  confianca_ia: number | null;
  cancelada: boolean;
  processos: { id: string; numero_cnj_mascara: string | null } | null;
}

/** Cor da confiança: alta em verde, média em âmbar, baixa em vermelho. */
function corConfianca(valor: number | null): string {
  if (valor === null) return "text-zinc-400";
  if (valor >= 0.85) return "text-emerald-700";
  if (valor >= 0.6) return "text-ouro-700";
  return "text-red-600";
}

export function CaixaPublicacoes({ itens }: { itens: LinhaCaixa[] }) {
  if (itens.length === 0) {
    return (
      <div className="p-4">
        <Vazio titulo="Nenhuma publicação com estes filtros" descricao="Troque os filtros ou lance uma publicação manual." />
      </div>
    );
  }
  return (
    <Table>
      <THead>
        <TR>
          <TH className="w-28">Disponibilizada</TH>
          <TH className="min-w-72">Publicação</TH>
          <TH>Processo</TH>
          <TH>Status</TH>
          <TH className="text-right">Confiança</TH>
        </TR>
      </THead>
      <TBody>
        {itens.map((p) => {
          const resumo = primeiraLinha(p.resumo_ia);
          const confianca = formatarConfianca(p.confianca_ia);
          return (
            <TR key={p.id} className={p.cancelada ? "opacity-60" : undefined}>
              <TD className="align-top whitespace-nowrap">
                <Link href={`/publicacoes/${p.id}`} className="block font-semibold text-zinc-950 tabular-nums hover:text-marca-700">
                  {formatarData(p.data_disponibilizacao) || "—"}
                </Link>
                <span className="block text-xs text-zinc-500">{ROTULO_FONTE[p.fonte] ?? p.fonte}</span>
              </TD>
              <TD className="align-top">
                <Link href={`/publicacoes/${p.id}`} className="group block min-w-0" title={p.resumo_ia ?? undefined}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-zinc-950 group-hover:text-marca-700">{p.tipo ? ROTULO_TIPO_PUBLICACAO[p.tipo] ?? p.tipo : "Sem tipo"}</span>
                    {p.sugere_sigilo ? <Badge tom="perigo">sigilo?</Badge> : null}
                    {p.revisar_classificacao ? <Badge tom="alerta">revisar</Badge> : null}
                    {p.cancelada ? <Badge tom="contorno">cancelada</Badge> : null}
                  </span>
                  <span className={cn("mt-0.5 block max-w-xl text-[13px] leading-snug", resumo ? "line-clamp-2 text-zinc-600" : "text-zinc-400")}>{resumo || "sem resumo"}</span>
                </Link>
              </TD>
              <TD className="align-top whitespace-nowrap">
                {p.processo_id ? (
                  <Link href={`/processos/${p.processo_id}`} className="font-mono text-xs text-zinc-700 hover:text-marca-700 hover:underline">
                    {p.processos?.numero_cnj_mascara ?? p.numero_processo_texto ?? "processo"}
                  </Link>
                ) : (
                  <span className="block text-xs text-zinc-500">
                    sem processo
                    {p.numero_processo_texto ? <span className="block font-mono text-zinc-400">{p.numero_processo_texto}</span> : null}
                  </span>
                )}
              </TD>
              <TD className="align-top">
                <Badge tom={TOM_STATUS_PUBLICACAO[p.status] ?? "neutro"}>{ROTULO_STATUS_PUBLICACAO[p.status] ?? p.status}</Badge>
              </TD>
              <TD className={cn("align-top text-right text-xs font-semibold tabular-nums", corConfianca(p.confianca_ia))}>{confianca || "—"}</TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
