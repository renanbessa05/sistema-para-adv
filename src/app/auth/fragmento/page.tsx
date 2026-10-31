"use client";

import { useEffect } from "react";
import { criarClienteBrowser } from "@/lib/supabase/client";
import { destinoSeguro } from "@/lib/seguranca/destino-seguro";

const ERRO_LINK = "/login?erro=" + encodeURIComponent("Link inválido ou expirado. Peça um novo.");

/**
 * Chegada de convite ou recuperação do Supabase: a sessão vem no fragmento da URL (#access_token=...).
 * O fragmento não chega ao servidor, então esta página lê, grava a sessão no navegador e segue para o destino.
 */
export default function PaginaFragmento() {
  useEffect(() => {
    const parametros = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = parametros.get("access_token");
    const refreshToken = parametros.get("refresh_token");
    const voltar = destinoSeguro(new URLSearchParams(window.location.search).get("voltar"));
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (!accessToken || !refreshToken) {
      window.location.replace(ERRO_LINK);
      return;
    }
    criarClienteBrowser()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => window.location.replace(error ? ERRO_LINK : voltar));
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-900">
      <p className="text-sm text-zinc-500">Entrando no sistema…</p>
    </main>
  );
}
