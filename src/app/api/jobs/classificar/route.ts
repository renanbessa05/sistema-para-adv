import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { autorizarCron } from "@/server/jobs/protecao";
import { classificarPendentes } from "@/server/jobs/classificar";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const negado = autorizarCron(request);
  if (negado) return negado;
  const admin = criarClienteAdmin();
  const resultado = await classificarPendentes(admin, { lote: 10 });
  const falhou = resultado.some((r) => r.ok === false);
  return NextResponse.json({ rotina: "classificar", escritorios: resultado }, { status: falhou ? 500 : 200 });
}
