import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatarData } from "@/lib/utils";

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
    <Badge tom={TOM_URGENCIA[urgencia]} className="font-mono">
      {formatarData(dataFinal)}
      {sufixo}
    </Badge>
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
  return (
    <Link href={`/prazos/${prazo.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
      <span className="flex flex-col">
        <span className="font-medium">{prazo.ato_descricao ?? "ato a praticar"}</span>
        {prazo.processo ? <span className="font-mono text-xs text-zinc-500">{prazo.processo.numero_cnj_mascara ?? "processo"}</span> : null}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {prazo.calendario_incompleto ? <Badge tom="alerta">calendário incompleto</Badge> : null}
        <Badge tom={TOM_STATUS_PRAZO[prazo.status] ?? "neutro"}>{ROTULO_STATUS_PRAZO[prazo.status] ?? prazo.status}</Badge>
        <BadgeDataFinal dataFinal={prazo.data_final} hoje={hoje} status={prazo.status} />
        {prazo.data_interna ? <span className="text-xs text-zinc-500">interna {formatarData(prazo.data_interna)}</span> : null}
      </span>
    </Link>
  );
}
