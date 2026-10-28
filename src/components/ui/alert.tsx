import * as React from "react";
import { cn } from "@/lib/utils";

type Tom = "info" | "sucesso" | "alerta" | "perigo";
const tons: Record<Tom, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100",
  sucesso: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
  alerta: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  perigo: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100",
};

export function Alert({ className, tom = "info", titulo, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { tom?: Tom; titulo?: string }) {
  return (
    <div role="alert" className={cn("rounded-md border px-3 py-2 text-sm", tons[tom], className)} {...props}>
      {titulo ? <p className="font-semibold">{titulo}</p> : null}
      <div>{children}</div>
    </div>
  );
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800", className)} {...props} />;
}

export function Separator({ className, ...props }: React.HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn("my-3 border-zinc-200 dark:border-zinc-800", className)} {...props} />;
}

export function Vazio({ titulo, descricao, acao }: { titulo: string; descricao?: string; acao?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
      <p className="font-medium">{titulo}</p>
      {descricao ? <p className="max-w-md text-sm text-zinc-500">{descricao}</p> : null}
      {acao}
    </div>
  );
}
