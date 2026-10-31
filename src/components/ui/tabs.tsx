"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Aba = { valor: string; rotulo: React.ReactNode; conteudo: React.ReactNode };

/** Abas simples, sem dependência externa. Controladas por estado local ou `valor`/`aoMudar`. */
export function Tabs({ abas, valor, aoMudar, className }: { abas: Aba[]; valor?: string; aoMudar?: (v: string) => void; className?: string }) {
  const [interno, setInterno] = React.useState(abas[0]?.valor ?? "");
  const atual = valor ?? interno;
  const mudar = (v: string) => {
    setInterno(v);
    aoMudar?.(v);
  };
  return (
    <div className={className}>
      <div role="tablist" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-zinc-200 dark:border-zinc-800">
        {abas.map((a) => (
          <button
            key={a.valor}
            role="tab"
            type="button"
            aria-selected={atual === a.valor}
            onClick={() => mudar(a.valor)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              atual === a.valor ? "border-marca-600 font-semibold text-marca-700 dark:border-zinc-100 dark:text-zinc-100" : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-200",
            )}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="pt-4">
        {abas.find((a) => a.valor === atual)?.conteudo}
      </div>
    </div>
  );
}
