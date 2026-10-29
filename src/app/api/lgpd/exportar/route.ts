import { NextResponse } from "next/server";
import { obterSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { gerarExportacaoTitular } from "@/server/lgpd";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Sócio gera o ZIP do titular e é redirecionado para o link assinado (5 min). Demais papéis: 403. */
export async function GET(request: Request) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada" }, { status: 401 });
  if (sessao.papel !== "socio") return NextResponse.json({ erro: "Só o sócio exporta dados de titulares" }, { status: 403 });

  const clienteId = new URL(request.url).searchParams.get("cliente") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(clienteId)) return NextResponse.json({ erro: "Titular inválido" }, { status: 400 });

  try {
    const supabase = await criarClienteServidor();
    const { url } = await gerarExportacaoTitular(supabase, sessao.escritorioId, sessao.usuarioId, clienteId);
    return NextResponse.redirect(url, { status: 302 });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Falha ao exportar";
    return NextResponse.json({ erro: mensagem }, { status: /não encontrado/i.test(mensagem) ? 404 : 500 });
  }
}
