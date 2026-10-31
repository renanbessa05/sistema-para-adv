import * as React from "react";
import { cn } from "@/lib/utils";

type Variante = "primaria" | "secundaria" | "contorno" | "fantasma" | "perigo" | "link";
type Tamanho = "sm" | "md" | "lg" | "icone";

const variantes: Record<Variante, string> = {
  primaria: "bg-marca-600 text-white shadow-marca hover:bg-marca-700 active:bg-marca-800",
  secundaria: "bg-marca-50 text-marca-700 hover:bg-marca-100 active:bg-marca-200",
  contorno: "border border-zinc-200 bg-white text-zinc-800 shadow-xs hover:border-zinc-300 hover:bg-zinc-50 active:bg-zinc-100",
  fantasma: "bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
  perigo: "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800",
  link: "h-auto bg-transparent px-0 text-marca-600 underline-offset-4 hover:underline",
};

const tamanhos: Record<Tamanho, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-6 text-[15px]",
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
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-[background-color,border-color,box-shadow,transform] duration-150 focus-visible:ring-2 focus-visible:ring-marca-500/40 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
        variantes[variante],
        tamanhos[tamanho],
        className,
      )}
      {...props}
    />
  );
});

/** Mesmas classes do botão, para usar em <Link> e <a> sem duplicar estilo. */
export function classesBotao({ variante = "primaria", tamanho = "md", className }: { variante?: Variante; tamanho?: Tamanho; className?: string } = {}): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-[background-color,border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-marca-500/40 focus-visible:ring-offset-2 focus-visible:outline-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
    variantes[variante],
    tamanhos[tamanho],
    className,
  );
}
