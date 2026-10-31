"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
import { entrarComLink } from "./actions";

export function FormularioLogin({ voltar }: { voltar: string }) {
  const [enviando, setEnviando] = useState(false);

  return (
    <form
      className="flex flex-col gap-3"
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
        <Input name="email" type="email" required autoComplete="email" placeholder="voce@escritorio.adv.br" />
      </Campo>
      <Button type="submit" disabled={enviando}>
        {enviando ? "Aguarde…" : "Receber link por e-mail"}
      </Button>
    </form>
  );
}
