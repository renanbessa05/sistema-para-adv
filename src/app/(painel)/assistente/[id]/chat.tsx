"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

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
      <div className="flex min-h-[40vh] flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        {mensagens.length === 0 ? <p className="text-sm text-zinc-500">Comece perguntando, por exemplo: &ldquo;quais meus prazos da semana?&rdquo; ou &ldquo;o que saiu no processo da Marina?&rdquo;.</p> : null}
        {mensagens.map((m) => (
          <div key={m.id} className={m.papel === "pessoa" ? "self-end" : "self-start"}>
            {m.tipo === "sistema" || m.tipo === "resumo" ? (
              <div className="max-w-3xl rounded-md border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700">{m.tipo === "resumo" ? "Resumo da conversa anterior: " : ""}{m.texto}</div>
            ) : m.papel === "pessoa" ? (
              <div className="max-w-3xl whitespace-pre-wrap rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">{m.texto}</div>
            ) : (
              <div className="prose prose-sm max-w-3xl rounded-lg bg-zinc-100 px-3 py-2 dark:prose-invert dark:bg-zinc-800">
                {m.texto ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.texto}</ReactMarkdown> : <span className="text-zinc-400">…</span>}
              </div>
            )}
          </div>
        ))}
        {ferramenta ? <p className="text-xs text-zinc-500">⏳ {ROTULO_FERRAMENTA[ferramenta] ?? ferramenta}…</p> : null}
        <div ref={fim} />
      </div>
      {erro ? <p className="text-sm text-red-700">{erro}</p> : null}
      {pedirNova ? <p className="text-sm text-amber-700">Conversa longa: use &ldquo;Continuar em nova conversa&rdquo; para manter a qualidade.</p> : null}
      {somenteLeitura ? null : (
        <form
          className="flex gap-2"
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
          />
          <Button type="submit" disabled={enviando || !texto.trim()}>
            {enviando ? "Enviando…" : "Enviar"}
          </Button>
        </form>
      )}
    </div>
  );
}
