import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (antigo middleware) do Next 16: renova a sessão do Supabase a cada requisição
 * e manda quem não está logado para /login nas rotas do painel.
 */
const ROTAS_PUBLICAS = [/^\/login/, /^\/privacidade/, /^\/status$/, /^\/convite\//, /^\/auth\//, /^\/api\/health/, /^\/api\/jobs\//, /^\/api\/whatsapp\//, /^\/_next\//, /^\/favicon/];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (ROTAS_PUBLICAS.some((re) => re.test(pathname))) return NextResponse.next();

  // O layout do painel lê este cabeçalho para mandar de volta à página certa depois do segundo fator
  const cabecalhos = new Headers(request.headers);
  cabecalhos.set("x-pathname", `${pathname}${request.nextUrl.search}`);
  const requisicao = { headers: cabecalhos };
  let resposta = NextResponse.next({ request: requisicao });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) return resposta;

  const supabase = createServerClient(url, chave, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        resposta = NextResponse.next({ request: requisicao });
        for (const { name, value, options } of cookiesToSet) resposta.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.searchParams.set("voltar", pathname);
    return NextResponse.redirect(destino);
  }
  return resposta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
