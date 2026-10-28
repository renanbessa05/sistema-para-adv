import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { envServidor } from "@/lib/config/env";

/**
 * Toda rota /api/jobs/* exige `Authorization: Bearer <CRON_SECRET>` (a Vercel envia esse cabeçalho nos crons).
 * Sem CRON_SECRET configurado, as rotas ficam fechadas.
 */
export function autorizarCron(request: Request): NextResponse | null {
  const segredo = envServidor().CRON_SECRET;
  const cabecalho = request.headers.get("authorization") ?? "";
  const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : "";
  if (!segredo || !token) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const a = Buffer.from(token);
  const b = Buffer.from(segredo);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  return null;
}
