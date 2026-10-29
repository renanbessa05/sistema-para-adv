import { NextResponse, type NextRequest } from "next/server";
import { obterSessao } from "@/server/sessao";
import { enviarMensagem, type EventoAssistente } from "@/server/assistente";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * POST { texto } → resposta em Server-Sent Events: eventos `texto` (delta), `ferramenta` (nome, fase),
 * `confirmacao` (eco de ação de escrita), `fim` (mensagem final gravada) e `erro`.
 * Server Actions não transmitem; o handler usa a mesma sessão por cookies.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ conversaId: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada" }, { status: 401 });
  const { conversaId } = await params;
  let texto = "";
  try {
    const corpo = (await request.json()) as { texto?: unknown };
    texto = typeof corpo.texto === "string" ? corpo.texto.trim() : "";
  } catch {
    return NextResponse.json({ erro: "Corpo inválido" }, { status: 400 });
  }
  if (!texto) return NextResponse.json({ erro: "Mensagem vazia" }, { status: 400 });
  if (texto.length > 8000) return NextResponse.json({ erro: "Mensagem longa demais (máximo 8.000 caracteres)" }, { status: 400 });

  const codificador = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controlador) {
      const enviar = (evento: EventoAssistente) => {
        controlador.enqueue(codificador.encode(`event: ${evento.tipo}\ndata: ${JSON.stringify(evento)}\n\n`));
      };
      try {
        await enviarMensagem(sessao, conversaId, texto, enviar);
      } catch (e) {
        enviar({ tipo: "erro", mensagem: e instanceof Error ? e.message : String(e) });
      } finally {
        controlador.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
