import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { autorizarCron } from "@/server/jobs/protecao";
import { captarDjen } from "@/server/jobs/captar-djen";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const negado = autorizarCron(request);
  if (negado) return negado;
  const url = new URL(request.url);
  const janela = Number(url.searchParams.get("janela") ?? "3");
  const admin = criarClienteAdmin();
  const resultado = await captarDjen(admin, { janelaDias: Number.isFinite(janela) && janela > 0 ? janela : 3 });
  const falhou = resultado.some((r) => r.ok === false);
  return NextResponse.json({ rotina: "captar-djen", escritorios: resultado }, { status: falhou ? 500 : 200 });
}
