import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Troca o código do link mágico por sessão e leva o usuário ao destino. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const voltarBruto = searchParams.get("voltar") ?? "/hoje";
  const voltar = voltarBruto.startsWith("/") && !voltarBruto.startsWith("//") ? voltarBruto : "/hoje";
  if (code) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${voltar}`);
  }
  return NextResponse.redirect(`${origin}/login?erro=${encodeURIComponent("Link inválido ou expirado. Peça um novo.")}`);
}
