import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { autorizarCron } from "@/server/jobs/protecao";

/** Fábrica das rotas de rotina: autoriza, executa e responde com o resumo. */
export function rotaDeJob(nome: string, executar: (admin: SupabaseClient, request: Request) => Promise<unknown>) {
  return async function GET(request: Request) {
    const negado = autorizarCron(request);
    if (negado) return negado;
    try {
      const resultado = await executar(criarClienteAdmin(), request);
      const falhou = Array.isArray(resultado) && resultado.some((r) => r && typeof r === "object" && (r as { ok?: boolean }).ok === false);
      return NextResponse.json({ rotina: nome, resultado }, { status: falhou ? 500 : 200 });
    } catch (e) {
      return NextResponse.json({ rotina: nome, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  };
}
