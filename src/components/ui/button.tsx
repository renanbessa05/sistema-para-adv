import * as React from "react";
import { cn } from "@/lib/utils";

type Variante = "primaria" | "secundaria" | "contorno" | "fantasma" | "perigo" | "link";
type Tamanho = "sm" | "md" | "lg" | "icone";

const variantes: Record<Variante, string> = {
  primaria: "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200",
  secundaria: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700",
  contorno: "border border-zinc-300 bg-transparent hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800",
  fantasma: "bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800",
  perigo: "bg-red-600 text-white hover:bg-red-700",
  link: "bg-transparent underline-offset-4 hover:underline text-zinc-900 dark:text-zinc-100 px-0",
};

const tamanhos: Record<Tamanho, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-6 text-base",
  icone: "h-9 w-9 p-0",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: Tamanho;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variante = "primaria", tamanho = "md", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-50",
        variantes[variante],
        tamanhos[tamanho],
        className,
      )}
      {...props}
    />
  );
});
