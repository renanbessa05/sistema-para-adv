"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/** Diálogo modal sobre o elemento nativo <dialog>. */
export function Dialog({
  aberto,
  aoFechar,
  titulo,
  children,
  rodape,
  className,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (aberto && !el.open) el.showModal();
    if (!aberto && el.open) el.close();
  }, [aberto]);
  return (
    <dialog
      ref={ref}
      onClose={aoFechar}
      onClick={(e) => {
        if (e.target === ref.current) aoFechar();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-lg backdrop:bg-zinc-950/40 backdrop:backdrop-blur-[2px] open:entrar dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100",
        className,
      )}
    >
      <div className="p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold tracking-[-0.01em] text-zinc-950">{titulo}</h2>
          <Button variante="fantasma" tamanho="icone" className="-mt-1 -mr-2 h-8 w-8" aria-label="Fechar" onClick={aoFechar}>
            <X />
          </Button>
        </div>
        <div className="text-sm">{children}</div>
        {rodape ? <div className="mt-5 flex justify-end gap-2">{rodape}</div> : null}
      </div>
    </dialog>
  );
}
