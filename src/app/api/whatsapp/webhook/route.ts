import { NextResponse, type NextRequest } from "next/server";
import { responderVerificacaoWebhook, verificarAssinatura } from "@/lib/whatsapp";
import { envServidor } from "@/lib/config/env";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { processarWebhook } from "@/server/whatsapp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Verificação do webhook pela Meta (uma vez, ao cadastrar a URL). */
export async function GET(request: NextRequest) {
  const env = envServidor();
  const p = request.nextUrl.searchParams;
  const r = responderVerificacaoWebhook({ hubMode: p.get("hub.mode"), hubVerifyToken: p.get("hub.verify_token"), hubChallenge: p.get("hub.challenge"), verifyTokenEsperado: env.WHATSAPP_VERIFY_TOKEN ?? "" });
  if (!r.ok) return new NextResponse("forbidden", { status: 403 });
  return new NextResponse(r.challenge, { status: 200 });
}

/** Mensagens e status. Responde 200 rápido; a Meta reenvia em caso de erro, e a inbox é idempotente. */
export async function POST(request: Request) {
  const env = envServidor();
  const corpo = await request.text();
  if (!env.WHATSAPP_APP_SECRET || !verificarAssinatura({ corpoBruto: corpo, cabecalho: request.headers.get("x-hub-signature-256"), appSecret: env.WHATSAPP_APP_SECRET })) {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ erro: "json inválido" }, { status: 400 });
  }
  try {
    const admin = criarClienteAdmin();
    const respostas = await processarWebhook(admin, payload);
    return NextResponse.json({ ok: true, processadas: respostas.length });
  } catch (e) {
    console.error("[whatsapp] falha ao processar webhook", e);
    // 200 mesmo assim: a inbox guarda o que entrou e a Meta não precisa reenviar indefinidamente.
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) });
  }
}
