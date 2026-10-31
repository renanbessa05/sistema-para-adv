import Link from "next/link";
import { ArrowRight, CheckCircle2, Flag, ShieldAlert, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type TomPasso = "info" | "alerta" | "perigo" | "sucesso";

const ESTILO: Record<TomPasso, { caixa: string; etiqueta: string; icone: string; botao: string; Icone: React.ComponentType<{ className?: string }> }> = {
  info: { caixa: "border-marca-200 bg-gradient-to-r from-marca-50 to-white", etiqueta: "text-marca-700", icone: "bg-marca-100 text-marca-700", botao: "bg-marca-600 text-white shadow-marca hover:bg-marca-700", Icone: Flag },
  alerta: { caixa: "border-ouro-300 bg-gradient-to-r from-ouro-50 to-white", etiqueta: "text-ouro-700", icone: "bg-ouro-100 text-ouro-600", botao: "bg-ouro-500 text-white shadow-sm hover:bg-ouro-600", Icone: TriangleAlert },
  perigo: { caixa: "border-red-200 bg-gradient-to-r from-red-50 to-white", etiqueta: "text-red-700", icone: "bg-red-100 text-red-700", botao: "bg-red-600 text-white shadow-sm hover:bg-red-700", Icone: ShieldAlert },
  sucesso: { caixa: "border-emerald-200 bg-gradient-to-r from-emerald-50 to-white", etiqueta: "text-emerald-700", icone: "bg-emerald-100 text-emerald-700", botao: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700", Icone: CheckCircle2 },
};

/**
 * Caixa "Próximo passo" no topo das telas de detalhe: diz o que fazer agora nesta etapa do fio
 * publicação → prazo → tarefa → peça → protocolo, com um único botão principal quando há tela para ir.
 * Com `concluido`, vira o fecho do fio ("tudo fechado") em verde.
 */
export function ProximoPasso({ titulo, descricao, href, rotulo, tom = "info", concluido = false, extras }: { titulo: string; descricao?: string; href?: string; rotulo?: string; tom?: TomPasso; concluido?: boolean; extras?: { href: string; rotulo: string }[] }) {
  const t = concluido ? "sucesso" : tom;
  const e = ESTILO[t];
  const Icone = e.Icone;
  return (
    <section aria-label={concluido ? "Fio concluído" : "Próximo passo"} className={cn("flex flex-wrap items-center gap-4 rounded-2xl border px-4 py-3.5 shadow-xs sm:px-5", e.caixa)}>
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", e.icone)} aria-hidden>
        <Icone className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[11px] font-bold tracking-[0.08em] uppercase", e.etiqueta)}>{concluido ? "Tudo fechado" : "Próximo passo"}</p>
        <p className="text-[15px] leading-snug font-bold text-zinc-950">{titulo}</p>
        {descricao ? <p className="mt-0.5 text-sm text-zinc-600">{descricao}</p> : null}
        {extras?.length ? (
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-zinc-600">
            {extras.map((x) => (
              <Link key={x.href} href={x.href} className="underline decoration-zinc-300 underline-offset-[3px] hover:text-zinc-950 hover:decoration-zinc-500">
                {x.rotulo}
              </Link>
            ))}
          </p>
        ) : null}
      </div>
      {href && rotulo ? (
        <Link href={href} className={cn("inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors sm:w-auto", e.botao)}>
          {rotulo}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      ) : null}
    </section>
  );
}
