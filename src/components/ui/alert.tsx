import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, Inbox, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tom = "info" | "sucesso" | "alerta" | "perigo";
const tons: Record<Tom, { caixa: string; icone: React.ComponentType<{ className?: string }>; cor: string }> = {
  info: { caixa: "border-marca-200 bg-marca-50 text-marca-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100", icone: Info, cor: "text-marca-600" },
  sucesso: { caixa: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100", icone: CheckCircle2, cor: "text-emerald-600" },
  alerta: { caixa: "border-ouro-300 bg-ouro-50 text-ouro-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100", icone: AlertTriangle, cor: "text-ouro-500" },
  perigo: { caixa: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100", icone: XCircle, cor: "text-red-600" },
};

export function Alert({ className, tom = "info", titulo, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { tom?: Tom; titulo?: string }) {
  const t = tons[tom];
  const Icone = t.icone;
  return (
    <div role="alert" className={cn("flex gap-3 rounded-xl border px-3.5 py-3 text-sm", t.caixa, className)} {...props}>
      <Icone className={cn("mt-0.5 h-4 w-4 shrink-0", t.cor)} aria-hidden />
      <div className="min-w-0 flex-1">
        {titulo ? <p className="font-semibold">{titulo}</p> : null}
        <div className={cn(titulo ? "mt-0.5 opacity-90" : undefined)}>{children}</div>
      </div>
    </div>
  );
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-lg bg-zinc-200/70 dark:bg-zinc-800", className)} {...props} />;
}

export function Separator({ className, ...props }: React.HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn("my-3 border-zinc-200 dark:border-zinc-800", className)} {...props} />;
}

export function Vazio({ titulo, descricao, acao, className }: { titulo: string; descricao?: string; acao?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 px-6 py-10 text-center dark:border-zinc-700", className)}>
      <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-zinc-400 shadow-xs ring-1 ring-zinc-200" aria-hidden>
        <Inbox className="h-5 w-5" />
      </span>
      <p className="mt-1 font-semibold text-zinc-900">{titulo}</p>
      {descricao ? <p className="max-w-md text-sm text-zinc-500">{descricao}</p> : null}
      {acao ? <div className="mt-2">{acao}</div> : null}
    </div>
  );
}
