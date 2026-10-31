"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
import { entrarComLink } from "./actions";

export function FormularioLogin({ voltar }: { voltar: string }) {
  const [enviando, setEnviando] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      action={async (fd) => {
        setEnviando(true);
        try {
          await entrarComLink(fd);
        } finally {
          setEnviando(false);
        }
      }}
    >
      <input type="hidden" name="voltar" value={voltar} />
      <Campo label="E-mail">
        <span className="relative block">
          <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
          <Input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="voce@escritorio.adv.br" className="h-11 pl-10" autoFocus />
        </span>
      </Campo>
      <Button type="submit" tamanho="lg" disabled={enviando} className="w-full">
        {enviando ? "Enviando…" : "Receber link por e-mail"}
      </Button>
    </form>
  );
}
