import Link from "next/link";
import { cn } from "@/lib/utils";

export type TomPasso = "info" | "alerta" | "perigo" | "sucesso";

const ESTILO: Record<TomPasso, { caixa: string; etiqueta: string; botao: string }> = {
  info: { caixa: "border-marca-200 bg-marca-50", etiqueta: "text-marca-700", botao: "bg-marca-600 text-white hover:bg-marca-700" },
  alerta: { caixa: "border-ouro-500/40 bg-amber-50", etiqueta: "text-amber-800", botao: "bg-ouro-500 text-white hover:bg-amber-600" },
  perigo: { caixa: "border-red-200 bg-red-50", etiqueta: "text-red-800", botao: "bg-red-600 text-white hover:bg-red-700" },
  sucesso: { caixa: "border-emerald-200 bg-emerald-50", etiqueta: "text-emerald-800", botao: "bg-emerald-600 text-white hover:bg-emerald-700" },
};

/**
 * Caixa "Próximo passo" no topo das telas de detalhe: diz o que fazer agora nesta etapa do fio
 * publicação → prazo → tarefa → peça → protocolo, com um único botão principal quando há tela para ir.
 * Com `concluido`, vira o fecho do fio ("tudo fechado") em verde.
 */
export function ProximoPasso({ titulo, descricao, href, rotulo, tom = "info", concluido = false, extras }: { titulo: string; descricao?: string; href?: string; rotulo?: string; tom?: TomPasso; concluido?: boolean; extras?: { href: string; rotulo: string }[] }) {
  const t = concluido ? "sucesso" : tom;
  const e = ESTILO[t];
  return (
    <section aria-label={concluido ? "Fio concluído" : "Próximo passo"} className={cn("flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3", e.caixa)}>
      <div className="min-w-0">
        <p className={cn("text-[11px] font-semibold uppercase tracking-wider", e.etiqueta)}>{concluido ? "Tudo fechado" : "Próximo passo"}</p>
        <p className="font-medium text-zinc-900">{titulo}</p>
        {descricao ? <p className="text-sm text-zinc-600">{descricao}</p> : null}
        {extras?.length ? (
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-zinc-600">
            {extras.map((x) => (
              <Link key={x.href} href={x.href} className="underline underline-offset-2 hover:text-zinc-900">
                {x.rotulo}
              </Link>
            ))}
          </p>
        ) : null}
      </div>
      {href && rotulo ? (
        <Link href={href} className={cn("inline-flex h-9 shrink-0 items-center rounded-md px-4 text-sm font-medium shadow-sm", e.botao)}>
          {rotulo} →
        </Link>
      ) : null}
    </section>
  );
}
