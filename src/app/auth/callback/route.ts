import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { criarClienteServidor } from "@/lib/supabase/server";

const TIPOS_OTP: ReadonlySet<string> = new Set<EmailOtpType>(["magiclink", "invite", "recovery", "email", "signup", "email_change"]);

/**
 * Troca o link de e-mail por sessão e leva o usuário ao destino. Aceita dois formatos:
 * - `?code=` (PKCE): links pedidos pelo próprio app (signInWithOtp na tela de login);
 * - `?token_hash=&type=`: links gerados fora do app (convite ou link mágico pela API admin / templates com {{ .TokenHash }}).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") ?? "";
  const voltarBruto = searchParams.get("voltar") ?? "/hoje";
  const voltar = voltarBruto.startsWith("/") && !voltarBruto.startsWith("//") ? voltarBruto : "/hoje";
  const supabase = await criarClienteServidor();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${voltar}`);
  } else if (tokenHash && TIPOS_OTP.has(tipo)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo as EmailOtpType });
    if (!error) return NextResponse.redirect(`${origin}${voltar}`);
  }
  return NextResponse.redirect(`${origin}/login?erro=${encodeURIComponent("Link inválido ou expirado. Peça um novo.")}`);
}
