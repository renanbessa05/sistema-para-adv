import * as React from "react";
import { cn } from "@/lib/utils";

type Tom = "neutro" | "info" | "sucesso" | "alerta" | "perigo" | "contorno";

const tons: Record<Tom, string> = {
  neutro: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-100",
  info: "bg-marca-50 text-marca-700 dark:bg-blue-900/40 dark:text-blue-200",
  sucesso: "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  alerta: "bg-ouro-100 text-ouro-700 dark:bg-amber-900/40 dark:text-amber-200",
  perigo: "bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-200",
  contorno: "border border-zinc-200 bg-white text-zinc-600 dark:border-zinc-700 dark:text-zinc-300",
};

export function Badge({ className, tom = "neutro", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tom?: Tom }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap tabular-nums", tons[tom], className)} {...props} />;
}
