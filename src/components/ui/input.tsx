import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-xs transition-[border-color,box-shadow] placeholder:text-zinc-400 hover:border-zinc-300 focus-visible:border-marca-500 focus-visible:ring-4 focus-visible:ring-marca-500/15 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:opacity-70 aria-invalid:border-red-400 aria-invalid:ring-red-500/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(base, "h-10 file:mr-3 file:h-full file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:text-xs file:font-semibold file:text-zinc-700", className)} {...props} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(base, "min-h-28 py-2.5 leading-relaxed", className)} {...props} />;
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        base,
        "h-10 appearance-none bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364708a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] bg-[length:16px] bg-[position:right_0.6rem_center] bg-no-repeat pr-9",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-[13px] font-semibold text-zinc-700 dark:text-zinc-300", className)} {...props} />;
}

/** Rótulo + controle. O <label> envolve o controle para que leitores de tela e testes associem os dois. */
export function Campo({ label, erro, dica, children, className }: { label: string; erro?: string; dica?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col", className)}>
      <span className="mb-1.5 block text-[13px] font-semibold text-zinc-700 dark:text-zinc-300">{label}</span>
      {children}
      {dica && !erro ? <span className="mt-1 text-xs text-zinc-500">{dica}</span> : null}
      {erro ? <span className="mt-1 text-xs font-medium text-red-600">{erro}</span> : null}
    </label>
  );
}

/** Caixa de marcação com título e explicação: para opções que mudam o fluxo (ex.: "Gera prazo"). */
export function CaixaMarcacao({ titulo, descricao, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { titulo: string; descricao?: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-white px-3.5 py-3 shadow-xs transition-colors hover:border-zinc-300 has-[:checked]:border-marca-300 has-[:checked]:bg-marca-50/60", className)}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 accent-marca-600" {...props} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-zinc-950">{titulo}</span>
        {descricao ? <span className="block text-xs text-zinc-500">{descricao}</span> : null}
      </span>
    </label>
  );
}

/** Agrupa campos de um formulário sob um título curto, com grade responsiva. */
export function GrupoCampos({ titulo, descricao, children, className, colunas = 2 }: { titulo?: string; descricao?: string; children: React.ReactNode; className?: string; colunas?: 1 | 2 | 3 }) {
  const grade = colunas === 1 ? "grid-cols-1" : colunas === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <fieldset className={cn("flex min-w-0 flex-col gap-3", className)}>
      {titulo ? (
        <legend className="mb-1 flex flex-col">
          <span className="text-sm font-bold text-zinc-950">{titulo}</span>
          {descricao ? <span className="text-xs text-zinc-500">{descricao}</span> : null}
        </legend>
      ) : null}
      <div className={cn("grid gap-3", grade)}>{children}</div>
    </fieldset>
  );
}
