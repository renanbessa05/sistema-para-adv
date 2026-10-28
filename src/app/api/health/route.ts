import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { envPublico, envServidor } from "@/lib/config/env";

export const dynamic = "force-dynamic";

/** Saúde do app e do banco. Usado pela Vercel, pelo vigilante de captação e pelo runbook. */
export async function GET() {
  const inicio = Date.now();
  let db: "ok" | "erro" = "erro";
  let detalhe: string | undefined;
  try {
    const chave = envServidor().SUPABASE_SERVICE_ROLE_KEY ?? envPublico.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = createClient(envPublico.NEXT_PUBLIC_SUPABASE_URL, chave, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.schema("ref").from("tribunais").select("sigla").limit(1);
    if (error) throw error;
    db = "ok";
  } catch (e) {
    detalhe = e instanceof Error ? e.message : String(e);
  }
  const corpo = { status: db === "ok" ? "ok" : "degradado", db, detalhe, latencia_ms: Date.now() - inicio, versao: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local" };
  return NextResponse.json(corpo, { status: db === "ok" ? 200 : 503 });
}
