"use client";

import * as React from "react";
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
        "w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/40 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100",
        className,
      )}
    >
      <div className="p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <Button variante="fantasma" tamanho="sm" aria-label="Fechar" onClick={aoFechar}>
            ×
          </Button>
        </div>
        <div className="text-sm">{children}</div>
        {rodape ? <div className="mt-4 flex justify-end gap-2">{rodape}</div> : null}
      </div>
    </dialog>
  );
}
