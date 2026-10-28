import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { autorizarCron } from "@/server/jobs/protecao";
import { enriquecerDatajud } from "@/server/jobs/enriquecer-datajud";

export const maxDuration = 300;

export async function GET(request: Request) {
  const negado = autorizarCron(request);
  if (negado) return negado;
  const admin = criarClienteAdmin();
  const resultado = await enriquecerDatajud(admin, { lote: 50 });
  const falhou = resultado.some((r) => r.ok === false);
  return NextResponse.json({ rotina: "enriquecer-datajud", escritorios: resultado }, { status: falhou ? 500 : 200 });
}
