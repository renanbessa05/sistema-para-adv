"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
import { entrarComLink, entrarComSenha } from "./actions";

export function FormularioLogin({ voltar }: { voltar: string }) {
  const [modo, setModo] = useState<"link" | "senha">("link");
  const [enviando, setEnviando] = useState(false);

  return (
    <form
      className="flex flex-col gap-3"
      action={async (fd) => {
        setEnviando(true);
        try {
          if (modo === "link") await entrarComLink(fd);
          else await entrarComSenha(fd);
        } finally {
          setEnviando(false);
        }
      }}
    >
      <input type="hidden" name="voltar" value={voltar} />
      <Campo label="E-mail">
        <Input name="email" type="email" required autoComplete="email" placeholder="voce@escritorio.adv.br" />
      </Campo>
      {modo === "senha" ? (
        <Campo label="Senha">
          <Input name="senha" type="password" required autoComplete="current-password" />
        </Campo>
      ) : null}
      <Button type="submit" disabled={enviando}>
        {enviando ? "Aguarde…" : modo === "link" ? "Receber link por e-mail" : "Entrar"}
      </Button>
      <button type="button" className="text-xs text-zinc-500 underline-offset-2 hover:underline" onClick={() => setModo(modo === "link" ? "senha" : "link")}>
        {modo === "link" ? "Entrar com senha" : "Entrar com link por e-mail"}
      </button>
    </form>
  );
}
