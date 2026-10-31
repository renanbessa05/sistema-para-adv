"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

type Props = Omit<ButtonProps, "type"> & {
  /** Texto enquanto a server action roda (ex.: "Redigindo…"). */
  rotuloEnviando: string;
};

/**
 * Botão de submit que mostra andamento e trava o segundo clique enquanto a server action do formulário
 * ainda não respondeu. Use nas ações demoradas (IA, DataJud, exportações): sem isso a pessoa clica de novo
 * e a ação roda duas vezes.
 */
export function BotaoEnviar({ rotuloEnviando, children, disabled, className, ...props }: Props) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" aria-busy={pending} disabled={disabled || pending} className={className} {...props}>
      {pending ? (
        <>
          <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {rotuloEnviando}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
