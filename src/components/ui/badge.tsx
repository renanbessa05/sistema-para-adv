import * as React from "react";
import { cn } from "@/lib/utils";

type Tom = "neutro" | "info" | "sucesso" | "alerta" | "perigo" | "contorno";

const tons: Record<Tom, string> = {
  neutro: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  sucesso: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  alerta: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  perigo: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  contorno: "border border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300",
};

export function Badge({ className, tom = "neutro", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tom?: Tom }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tons[tom], className)} {...props} />;
}
