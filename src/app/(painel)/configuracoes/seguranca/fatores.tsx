"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarClienteBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * Remover um fator exige sessão aal2 no Supabase Auth; quando falha, mostra o motivo e o caminho para resolver.
 * Para sócio e advogado o último autenticador verificado não é removível aqui: cadastre o novo antes de remover o antigo
 * (a carência do banco vale só para contas com menos de 7 dias, então remover o último trancaria o acesso aos dados).
 */
export function BotaoRemoverFator({ id, nome, ultimoVerificado }: { id: string; nome: string; ultimoVerificado: boolean }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState(false);

  if (ultimoVerificado) {
    return <p className="max-w-xs text-xs text-zinc-500">Único autenticador verificado: cadastre outro antes de remover este.</p>;
  }

  async function remover() {
    if (!window.confirm(`Remover o autenticador "${nome}"?`)) return;
    setRemovendo(true);
    setErro(null);
    try {
      const supabase = criarClienteBrowser();
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) {
        const m = error.message ?? "";
        setErro(
          /aal2|assurance/i.test(m)
            ? "Para remover um autenticador é preciso ter confirmado o código nesta sessão. Confirme o segundo fator e tente de novo."
            : `Não foi possível remover: ${m}`,
        );
        return;
      }
      router.refresh();
    } finally {
      setRemovendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variante="fantasma" tamanho="sm" className="w-fit text-xs text-red-700" onClick={remover} disabled={removendo}>
        {removendo ? "Removendo…" : "Remover"}
      </Button>
      {erro ? (
        <p role="alert" className="max-w-xs text-xs text-red-700">
          {erro}{" "}
          {/aal2|confirmado o código/i.test(erro) ? (
            <a href="/mfa?voltar=%2Fconfiguracoes%2Fseguranca" className="underline">
              Confirmar agora
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
