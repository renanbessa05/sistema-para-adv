import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { competenciaValida, primeiroDiaDoMes, resumirPorUsuario } from "@/lib/relatorios/agregar";
import { csvProdutividade } from "@/lib/relatorios/csv";
import { produtividadeDoPeriodo } from "@/server/relatorios";

export const dynamic = "force-dynamic";

/** CSV de produtividade de um mês (?mes=AAAA-MM). A RPC recusa quem não é sócio ou advogado (403). */
export async function GET(request: Request) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });

  const mes = new URL(request.url).searchParams.get("mes") ?? "";
  if (!competenciaValida(mes)) return NextResponse.json({ erro: "Informe o mês como AAAA-MM" }, { status: 400 });

  const competencia = primeiroDiaDoMes(`${mes}-01`);
  try {
    const linhas = await produtividadeDoPeriodo(supabase, competencia, competencia);
    const csv = csvProdutividade(resumirPorUsuario(linhas));
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="produtividade-${mes}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: mensagem }, { status: mensagem.includes("Apenas sócio") || mensagem.includes("Segundo fator") ? 403 : 500 });
  }
}
