"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, SendHorizonal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Mensagem {
  id: string;
  papel: "pessoa" | "assistente";
  tipo: string;
  texto: string;
}

/**
 * Cliente do chat: envia a mensagem por POST e lê a resposta em Server-Sent Events (texto em streaming,
 * ferramentas em uso, pedido de confirmação). Markdown renderizado sem HTML cru.
 */
export function Chat({ conversaId, inicial, somenteLeitura }: { conversaId: string; inicial: Mensagem[]; somenteLeitura: boolean }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>(inicial);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ferramenta, setFerramenta] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pedirNova, setPedirNova] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, ferramenta]);

  async function enviar(conteudo: string) {
    const pergunta = conteudo.trim();
    if (!pergunta || enviando) return;
    setErro(null);
    setEnviando(true);
    setTexto("");
    const idPessoa = `p-${Date.now()}`;
    const idResposta = `a-${Date.now()}`;
    setMensagens((m) => [...m, { id: idPessoa, papel: "pessoa", tipo: "text", texto: pergunta }, { id: idResposta, papel: "assistente", tipo: "text", texto: "" }]);
    const acrescentar = (delta: string) => setMensagens((m) => m.map((x) => (x.id === idResposta ? { ...x, texto: x.texto + delta } : x)));
    try {
      const resposta = await fetch(`/api/assistente/${conversaId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: pergunta }) });
      if (!resposta.ok || !resposta.body) {
        const corpo = await resposta.json().catch(() => ({}));
        throw new Error((corpo as { erro?: string }).erro ?? `Falha (${resposta.status})`);
      }
      const leitor = resposta.body.getReader();
      const decodificador = new TextDecoder();
      let buffer = "";
      let textoFinal: string | null = null;
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        buffer += decodificador.decode(value, { stream: true });
        let separador = buffer.indexOf("\n\n");
        while (separador >= 0) {
          const bloco = buffer.slice(0, separador);
          buffer = buffer.slice(separador + 2);
          separador = buffer.indexOf("\n\n");
          const linhaDados = bloco.split("\n").find((l) => l.startsWith("data: "));
          if (!linhaDados) continue;
          const evento = JSON.parse(linhaDados.slice(6)) as { tipo: string; delta?: string; nome?: string; fase?: string; eco?: string; texto?: string; mensagem?: string; pedirNovaConversa?: boolean };
          if (evento.tipo === "texto" && evento.delta) acrescentar(evento.delta);
          else if (evento.tipo === "ferramenta") setFerramenta(evento.fase === "inicio" ? (evento.nome ?? null) : null);
          else if (evento.tipo === "confirmacao" && evento.eco) textoFinal = evento.eco;
          else if (evento.tipo === "fim") {
            textoFinal = evento.texto ?? textoFinal;
            setPedirNova(Boolean(evento.pedirNovaConversa));
          } else if (evento.tipo === "erro") throw new Error(evento.mensagem ?? "Erro na assistente");
        }
      }
      if (textoFinal !== null) {
        const final = textoFinal;
        setMensagens((m) => m.map((x) => (x.id === idResposta ? { ...x, texto: final } : x)));
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setMensagens((m) => m.filter((x) => x.id !== idResposta || x.texto));
    } finally {
      setEnviando(false);
      setFerramenta(null);
    }
  }

  const ROTULO_FERRAMENTA: Record<string, string> = {
    consultar_processo: "consultando o processo",
    listar_publicacoes: "lendo as publicações",
    ler_publicacao: "lendo a publicação",
    listar_prazos: "verificando os prazos",
    calcular_prazo: "contando o prazo",
    listar_tarefas: "verificando as tarefas",
    listar_documentos: "listando os documentos",
    ler_documento: "lendo o documento",
    listar_equipe: "consultando a equipe",
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-[40vh] flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 shadow-xs sm:p-4" role="log" aria-live="polite">
        {mensagens.length === 0 ? (
          <div className="m-auto flex max-w-sm flex-col items-center gap-2 py-8 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-marca-50 text-marca-600" aria-hidden>
              <Sparkles className="h-5 w-5" />
            </span>
            <p className="text-sm text-zinc-500">Comece perguntando, por exemplo: &ldquo;quais meus prazos da semana?&rdquo; ou &ldquo;o que saiu no processo da Marina?&rdquo;.</p>
          </div>
        ) : null}
        {mensagens.map((m) => {
          const sistema = m.tipo === "sistema" || m.tipo === "resumo";
          const pessoa = m.papel === "pessoa";
          return (
            <div key={m.id} className={cn("flex w-full", sistema ? "justify-center" : pessoa ? "justify-end" : "justify-start")}>
              {sistema ? (
                <div className="max-w-[90%] rounded-xl border border-dashed border-zinc-300 bg-white/60 px-3 py-2 text-center text-xs leading-snug text-zinc-500">
                  {m.tipo === "resumo" ? "Resumo da conversa anterior: " : ""}
                  {m.texto}
                </div>
              ) : pessoa ? (
                <div className="max-w-[88%] rounded-2xl rounded-br-md bg-marca-100 px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-marca-900 sm:max-w-[75%]">{m.texto}</div>
              ) : (
                <div className="flex max-w-[92%] items-start gap-2.5 sm:max-w-[80%]">
                  <span className="mt-1 hidden h-7 w-7 shrink-0 place-items-center rounded-lg bg-marca-600 text-white shadow-marca sm:grid" aria-hidden>
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                  <div className="prose prose-sm min-w-0 max-w-none rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-2.5 shadow-xs">
                    {m.texto ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.texto}</ReactMarkdown>
                    ) : (
                      <span className="inline-flex items-center gap-1 py-1 text-zinc-400" aria-label="Pensando">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-300 [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-300 [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-300" />
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {ferramenta ? (
          <p className="flex items-center gap-2 pl-1 text-xs text-zinc-500 sm:pl-10">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-marca-600" aria-hidden />
            {ROTULO_FERRAMENTA[ferramenta] ?? ferramenta}…
          </p>
        ) : null}
        <div ref={fim} />
      </div>
      {erro ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p> : null}
      {pedirNova ? <p className="rounded-lg bg-ouro-50 px-3 py-2 text-sm text-ouro-700">Conversa longa: use &ldquo;Continuar em nova conversa&rdquo; para manter a qualidade.</p> : null}
      {somenteLeitura ? null : (
        <form
          className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex items-end gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-md md:bottom-4"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar(texto);
          }}
        >
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar(texto);
              }
            }}
            rows={2}
            placeholder="Pergunte à assistente… (Enter envia, Shift+Enter quebra linha)"
            disabled={enviando}
            aria-label="Mensagem"
            className="min-h-11 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button type="submit" disabled={enviando || !texto.trim()} className="h-10 shrink-0 px-3 sm:px-4" aria-label={enviando ? "Enviando…" : "Enviar"}>
            {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <SendHorizonal aria-hidden />}
            <span className="hidden sm:inline">{enviando ? "Enviando…" : "Enviar"}</span>
          </Button>
        </form>
      )}
    </div>
  );
}
