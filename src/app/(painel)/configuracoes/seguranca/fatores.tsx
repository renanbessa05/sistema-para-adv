"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarClienteBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

/** Remover um fator exige sessão aal2 no Supabase Auth; quando falha, mostra o motivo e o caminho para resolver. */
export function BotaoRemoverFator({ id, nome, ultimoVerificado }: { id: string; nome: string; ultimoVerificado: boolean }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState(false);

  async function remover() {
    const aviso = ultimoVerificado
      ? `Este é o único autenticador verificado. Sem ele, no próximo acesso você terá que cadastrar outro antes de ver qualquer dado. Remover "${nome}"?`
      : `Remover o autenticador "${nome}"?`;
    if (!window.confirm(aviso)) return;
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
