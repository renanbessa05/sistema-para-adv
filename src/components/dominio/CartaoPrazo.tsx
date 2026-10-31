import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn, formatarData } from "@/lib/utils";

/** Rótulos, tons e urgência de prazos (puros, usados na lista, no detalhe e no detalhe da publicação). */

type TomBadge = "neutro" | "info" | "sucesso" | "alerta" | "perigo" | "contorno";

export const ROTULO_STATUS_PRAZO: Record<string, string> = {
  sugerido: "Sugerido",
  confirmado: "Confirmado",
  rejeitado: "Rejeitado",
  cumprido: "Cumprido",
  vencido: "Vencido",
  suspenso: "Suspenso",
  prorrogado: "Prorrogado",
  cancelado: "Cancelado",
};

export const TOM_STATUS_PRAZO: Record<string, TomBadge> = {
  sugerido: "info",
  confirmado: "sucesso",
  rejeitado: "neutro",
  cumprido: "sucesso",
  vencido: "perigo",
  suspenso: "alerta",
  prorrogado: "alerta",
  cancelado: "contorno",
};

export const ROTULO_ORIGEM_PRAZO: Record<string, string> = {
  publicacao_djen: "Publicação do DJEN",
  pje_manual: "PJe (manual)",
  email_manual: "E-mail (manual)",
  domicilio_eletronico: "Domicílio eletrônico",
  audiencia: "Audiência",
  decisao: "Decisão",
  manual: "Manual",
};

export const ROTULO_CONTAGEM: Record<string, string> = { dias_uteis: "dias úteis", dias_corridos: "dias corridos", horas: "horas" };

/** Status em que o prazo ainda está "vivo" (a data final importa). */
export const STATUS_PRAZO_ABERTOS = ["sugerido", "confirmado", "prorrogado", "suspenso", "vencido"];

export type Urgencia = "vencido" | "hoje" | "proximo" | "normal" | "encerrado";

/** Diferença em dias civis entre duas datas ISO (b - a). */
function diasEntre(a: string, b: string): number {
  const [a1, a2, a3] = a.split("-").map(Number);
  const [b1, b2, b3] = b.split("-").map(Number);
  return Math.round((Date.UTC(b1, b2 - 1, b3) - Date.UTC(a1, a2 - 1, a3)) / 86_400_000);
}

/**
 * Urgência pela data final em relação a hoje: vencido (vermelho), hoje (vermelho), até 3 dias (âmbar).
 * Prazos encerrados (cumprido, cancelado, rejeitado) não têm urgência.
 */
export function urgenciaPrazo(dataFinal: string, hoje: string, status: string): Urgencia {
  if (!STATUS_PRAZO_ABERTOS.includes(status)) return "encerrado";
  if (status === "vencido") return "vencido";
  const dias = diasEntre(hoje, dataFinal);
  if (dias < 0) return "vencido";
  if (dias === 0) return "hoje";
  if (dias <= 3) return "proximo";
  return "normal";
}

export const TOM_URGENCIA: Record<Urgencia, TomBadge> = { vencido: "perigo", hoje: "perigo", proximo: "alerta", normal: "neutro", encerrado: "contorno" };

export function BadgeDataFinal({ dataFinal, hoje, status }: { dataFinal: string; hoje: string; status: string }) {
  const urgencia = urgenciaPrazo(dataFinal, hoje, status);
  const sufixo = urgencia === "vencido" ? " · vencido" : urgencia === "hoje" ? " · hoje" : "";
  return (
    <Badge tom={TOM_URGENCIA[urgencia]}>
      {formatarData(dataFinal)}
      {sufixo}
    </Badge>
  );
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const COR_DIA: Record<Urgencia, string> = {
  vencido: "bg-red-50 text-red-700",
  hoje: "bg-red-50 text-red-700",
  proximo: "bg-ouro-100 text-ouro-700",
  normal: "bg-marca-50 text-marca-700",
  encerrado: "bg-zinc-100 text-zinc-500",
};

const TAMANHO_DIA = {
  sm: { caixa: "h-9 w-9 rounded-lg", dia: "text-[13px]", mes: "text-[8px]" },
  md: { caixa: "h-11 w-11 rounded-xl", dia: "text-[15px]", mes: "text-[9px]" },
  lg: { caixa: "h-16 w-16 rounded-2xl", dia: "text-[24px]", mes: "text-[10px]" },
} as const;

/** Quadradinho de agenda com o dia e o mês, colorido pela urgência. */
export function DiaAgenda({ data, urgencia, tamanho = "md", className }: { data: string; urgencia: Urgencia; tamanho?: keyof typeof TAMANHO_DIA; className?: string }) {
  const [, m, d] = data.slice(0, 10).split("-");
  const t = TAMANHO_DIA[tamanho];
  return (
    <span className={cn("flex shrink-0 flex-col items-center justify-center leading-none tabular-nums", t.caixa, COR_DIA[urgencia], className)} aria-hidden>
      <span className={cn("font-extrabold tracking-[-0.02em]", t.dia)}>{d}</span>
      <span className={cn("mt-0.5 font-bold tracking-[0.08em] uppercase opacity-80", t.mes)}>{MESES[Number(m) - 1] ?? m}</span>
    </span>
  );
}

export interface PrazoResumo {
  id: string;
  ato_descricao: string | null;
  data_final: string;
  data_interna: string | null;
  status: string;
  calendario_incompleto: boolean;
  processo?: { id: string; numero_cnj_mascara: string | null } | null;
}

/** Linha compacta de um prazo, com link para o detalhe. */
export function CartaoPrazo({ prazo, hoje }: { prazo: PrazoResumo; hoje: string }) {
  const urgencia = urgenciaPrazo(prazo.data_final, hoje, prazo.status);
  return (
    <Link href={`/prazos/${prazo.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm shadow-xs transition-colors hover:border-marca-200 hover:bg-marca-50/40 dark:border-zinc-800 dark:hover:bg-zinc-900">
      <DiaAgenda data={prazo.data_final} urgencia={urgencia} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold text-zinc-950">{prazo.ato_descricao ?? "ato a praticar"}</span>
        <span className="text-xs text-zinc-500 tabular-nums">
          {prazo.processo ? <span className="font-mono">{prazo.processo.numero_cnj_mascara ?? "processo"}</span> : "sem processo"}
          {prazo.data_interna ? ` · interna ${formatarData(prazo.data_interna)}` : ""}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        {prazo.calendario_incompleto ? <Badge tom="alerta">calendário incompleto</Badge> : null}
        <Badge tom={TOM_STATUS_PRAZO[prazo.status] ?? "neutro"}>{ROTULO_STATUS_PRAZO[prazo.status] ?? prazo.status}</Badge>
        <BadgeDataFinal dataFinal={prazo.data_final} hoje={hoje} status={prazo.status} />
      </span>
    </Link>
  );
}
