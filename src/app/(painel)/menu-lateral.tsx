"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { GrupoMenu } from "./menu";

/** Ativo quando a rota atual é o item ou está dentro dele (ex.: /processos/123 destaca Processos). */
function ativo(caminho: string, href: string): boolean {
  return caminho === href || caminho.startsWith(`${href}/`);
}

export function MenuLateral({ grupos }: { grupos: GrupoMenu[] }) {
  const caminho = usePathname();
  return (
    <nav aria-label="Principal" className="flex flex-col gap-5">
      {grupos.map((g) => (
        <div key={g.titulo} className="flex flex-col gap-1">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-marca-300">{g.titulo}</p>
          {g.itens.map((i) => {
            const on = ativo(caminho, i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  on ? "bg-white/10 font-medium text-white" : "text-marca-100/80 hover:bg-white/5 hover:text-white",
                )}
              >
                {i.rotulo}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Versão horizontal para telas estreitas: rolagem lateral, sem quebrar em várias linhas. */
export function MenuHorizontal({ grupos }: { grupos: GrupoMenu[] }) {
  const caminho = usePathname();
  const itens = grupos.flatMap((g) => g.itens);
  return (
    <nav aria-label="Principal" className="flex gap-1 overflow-x-auto px-3 py-2">
      {itens.map((i) => {
        const on = ativo(caminho, i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={on ? "page" : undefined}
            className={cn("shrink-0 rounded-md px-3 py-1.5 text-sm", on ? "bg-marca-600 text-white" : "text-marca-600 hover:bg-marca-50")}
          >
            {i.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
