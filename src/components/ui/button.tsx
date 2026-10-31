import * as React from "react";
import { cn } from "@/lib/utils";

type Variante = "primaria" | "secundaria" | "contorno" | "fantasma" | "perigo" | "link";
type Tamanho = "sm" | "md" | "lg" | "icone";

const variantes: Record<Variante, string> = {
  primaria: "bg-marca-600 text-white shadow-sm hover:bg-marca-700",
  secundaria: "bg-marca-50 text-marca-700 hover:bg-marca-100",
  contorno: "border border-zinc-300 bg-white text-zinc-800 shadow-sm hover:bg-zinc-50",
  fantasma: "bg-transparent text-zinc-700 hover:bg-zinc-100",
  perigo: "bg-red-600 text-white hover:bg-red-700",
  link: "bg-transparent px-0 text-marca-600 underline-offset-4 hover:underline",
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
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-300 disabled:pointer-events-none disabled:opacity-50",
        variantes[variante],
        tamanhos[tamanho],
        className,
      )}
      {...props}
    />
  );
});
