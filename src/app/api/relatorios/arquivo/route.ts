import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TIPO_EXPORTACAO_PRODUTIVIDADE } from "@/server/relatorios";

export const dynamic = "force-dynamic";

/**
 * Link temporário (5 min) para um CSV agendado já gerado. A linha de `exportacoes` e o objeto no Storage têm RLS
 * de sócio: quem não é sócio recebe 404.
 */
export async function GET(request: Request) {
  const supabase = await criarClienteServidor();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ erro: "Arquivo inválido" }, { status: 400 });

  const { data: exportacao } = await supabase.from("exportacoes").select("caminho_storage, tipo").eq("id", id).maybeSingle();
  if (!exportacao || exportacao.tipo !== TIPO_EXPORTACAO_PRODUTIVIDADE) return NextResponse.json({ erro: "Arquivo não encontrado" }, { status: 404 });

  const { data: assinado, error } = await supabase.storage.from("exportacoes").createSignedUrl(exportacao.caminho_storage, 300);
  if (error || !assinado) return NextResponse.json({ erro: "Arquivo não encontrado" }, { status: 404 });
  return NextResponse.redirect(assinado.signedUrl, { status: 302 });
}
