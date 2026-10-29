import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat, betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/**
 * Cliente de IA do sistema. Duas operações:
 * - `gerarEstruturado`: turno único com saída estruturada (schema Zod). Base do classificador, do roteador e dos agentes
 *   que produzem um objeto (diagnóstico, etapa de minuta, relatório de revisão).
 * - `conversar`: conversa com ferramentas de LEITURA (tool use pelo Tool Runner do SDK), com histórico append-only e
 *   streaming de texto. Base do chat `/assistente` e dos agentes que precisam consultar o banco antes de responder.
 * Nenhuma das duas executa ações: ferramentas só leem; o que é produção vai para `aprovacoes` pelo código.
 * Toda chamada passa por src/server/ia/executar.ts, que checa o teto mensal e grava `ia_execucoes`.
 */

export interface UsoTokens {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export type Esforco = "low" | "medium" | "high" | "xhigh" | "max";

/** Documento anexado à mensagem do usuário (vai como bloco `document` da API). */
export type DocumentoEntrada =
  | { tipo: "pdf_base64"; dados: string; titulo?: string; cache?: boolean }
  | { tipo: "arquivo"; fileId: string; titulo?: string; cache?: boolean }
  | { tipo: "texto"; texto: string; titulo?: string; cache?: boolean };

export interface RespostaEstruturada<T> {
  dados: T;
  uso: UsoTokens;
  modelo: string;
  latenciaMs: number;
  requestId: string | null;
  stopReason: string | null;
}

export interface PedidoEstruturado<T extends z.ZodType> {
  modelo: string;
  /** Prompt de sistema. Marcado para cache quando `cacheSistema` for true (vale a partir de 1024 tokens nos Claude 5). */
  sistema: string;
  cacheSistema?: boolean;
  /** Mensagem do usuário. Texto de terceiros deve vir delimitado como dado pelo chamador (delimitarDado). */
  usuario: string;
  /** Documentos anexados antes do texto da mensagem. */
  documentos?: DocumentoEntrada[];
  schema: T;
  maxTokens?: number;
  effort?: Esforco;
  /** Só para modelos que aceitam o parâmetro; os Claude 5 não aceitam e o padrão é não enviar. */
  temperatura?: number;
  agente: string;
}

/** Ferramenta de leitura exposta ao modelo numa conversa. `executar` devolve texto (já delimitado pelo chamador). */
export interface FerramentaIa<T extends z.ZodType = z.ZodType> {
  nome: string;
  descricao: string;
  schema: T;
  executar: (entrada: z.infer<T>) => Promise<string>;
  /** Pede validação estrita do JSON Schema na API (só para schemas sem campos opcionais sem null). */
  estrito?: boolean;
}

export type MensagemIa = Anthropic.Beta.Messages.BetaMessageParam;
export type BlocoConteudo = Anthropic.Beta.Messages.BetaContentBlock;

export interface ChamadaFerramenta {
  nome: string;
  entrada: unknown;
  saida: string;
  ms: number;
  erro?: string;
}

export interface PedidoConversa {
  modelo: string;
  sistema: string;
  cacheSistema?: boolean;
  /** Histórico completo, append-only: blocos do assistente devem ser reenviados exatamente como vieram. */
  mensagens: MensagemIa[];
  ferramentas: FerramentaIa[];
  maxTokens?: number;
  effort?: Esforco;
  /** Máximo de idas e voltas modelo → ferramenta → modelo. */
  maxIteracoes?: number;
  agente: string;
  /** Recebe cada pedaço de texto conforme chega (streaming). */
  aoTexto?: (delta: string) => void;
  /** Avisa quando uma ferramenta começa e termina. */
  aoFerramenta?: (nome: string, fase: "inicio" | "fim") => void;
}

export interface RespostaConversa {
  /** Mensagens geradas nesta rodada (assistente e resultados de ferramenta), para anexar ao histórico gravado. */
  novasMensagens: MensagemIa[];
  /** Texto final do assistente (concatenação dos blocos de texto da última mensagem). */
  texto: string;
  uso: UsoTokens;
  chamadas: ChamadaFerramenta[];
  modelo: string;
  latenciaMs: number;
  requestId: string | null;
  stopReason: string | null;
}

export interface ClienteIa {
  gerarEstruturado<T extends z.ZodType>(pedido: PedidoEstruturado<T>): Promise<RespostaEstruturada<z.infer<T>>>;
  conversar(pedido: PedidoConversa): Promise<RespostaConversa>;
}

export class ErroIa extends Error {
  constructor(
    public readonly tipo: "recusado" | "invalido_schema" | "erro" | "cancelado_teto",
    mensagem: string,
    public readonly detalhe?: unknown,
  ) {
    super(mensagem);
    this.name = "ErroIa";
  }
}

const USO_ZERO: UsoTokens = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };

function somarUso(a: UsoTokens, b: UsoTokens): UsoTokens {
  return { input: a.input + b.input, output: a.output + b.output, cacheWrite: a.cacheWrite + b.cacheWrite, cacheRead: a.cacheRead + b.cacheRead };
}

function usoDaMensagem(m: { usage?: { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null } }): UsoTokens {
  const u = m.usage ?? {};
  return { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0 };
}

function blocoSistema(texto: string, cache: boolean | undefined): Anthropic.Beta.Messages.BetaTextBlockParam[] {
  return [{ type: "text", text: texto, ...(cache ? { cache_control: { type: "ephemeral" as const } } : {}) }];
}

function blocosDocumento(documentos: DocumentoEntrada[] | undefined): Anthropic.Beta.Messages.BetaRequestDocumentBlock[] {
  return (documentos ?? []).map((d) => {
    const base = { type: "document" as const, ...(d.titulo ? { title: d.titulo } : {}), ...(d.cache ? { cache_control: { type: "ephemeral" as const } } : {}) };
    if (d.tipo === "pdf_base64") return { ...base, source: { type: "base64", media_type: "application/pdf", data: d.dados } };
    if (d.tipo === "arquivo") return { ...base, source: { type: "file", file_id: d.fileId } };
    return { ...base, source: { type: "text", media_type: "text/plain", data: d.texto } };
  });
}

/** Texto dos blocos `text` de uma mensagem do assistente. */
export function textoDaMensagem(conteudo: BlocoConteudo[] | Anthropic.Beta.Messages.BetaContentBlockParam[] | string): string {
  if (typeof conteudo === "string") return conteudo;
  return conteudo
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export function criarClienteIa(opcoes: { apiKey: string; baseURL?: string; fetchImpl?: typeof fetch; timeoutMs?: number }): ClienteIa {
  const anthropic = new Anthropic({
    apiKey: opcoes.apiKey,
    baseURL: opcoes.baseURL,
    fetch: opcoes.fetchImpl,
    timeout: opcoes.timeoutMs ?? 120_000,
    maxRetries: 2,
  });

  return {
    async gerarEstruturado(pedido) {
      const inicio = Date.now();
      try {
        const resposta = await anthropic.beta.messages.parse({
          model: pedido.modelo,
          max_tokens: pedido.maxTokens ?? 1024,
          // Os modelos Claude 5 rejeitam `temperature` ("Extra inputs are not permitted"); só enviamos quando pedido.
          ...(pedido.temperatura !== undefined ? { temperature: pedido.temperatura } : {}),
          system: blocoSistema(pedido.sistema, pedido.cacheSistema),
          messages: [{ role: "user", content: [...blocosDocumento(pedido.documentos), { type: "text", text: pedido.usuario }] }],
          output_config: { format: betaZodOutputFormat(pedido.schema), ...(pedido.effort ? { effort: pedido.effort } : {}) },
        });
        const latenciaMs = Date.now() - inicio;
        const uso = usoDaMensagem(resposta);
        if (resposta.stop_reason === "refusal") {
          throw new ErroIa("recusado", "O modelo recusou a tarefa", { uso });
        }
        const dados = resposta.parsed_output as z.infer<typeof pedido.schema> | null | undefined;
        if (dados === null || dados === undefined) {
          throw new ErroIa("invalido_schema", "Resposta sem saída estruturada válida", { stop_reason: resposta.stop_reason, uso });
        }
        return { dados, uso, modelo: resposta.model, latenciaMs, requestId: resposta._request_id ?? null, stopReason: resposta.stop_reason };
      } catch (e) {
        if (e instanceof ErroIa) throw e;
        throw new ErroIa("erro", e instanceof Error ? e.message : String(e), e);
      }
    },

    async conversar(pedido) {
      const inicio = Date.now();
      const chamadas: ChamadaFerramenta[] = [];
      const ferramentas = pedido.ferramentas.map((f) =>
        betaZodTool({
          name: f.nome,
          description: f.descricao,
          inputSchema: f.schema,
          ...(f.estrito ? { strict: true } : {}),
          run: async (entrada: unknown) => {
            const t0 = Date.now();
            pedido.aoFerramenta?.(f.nome, "inicio");
            try {
              const saida = await f.executar(entrada);
              chamadas.push({ nome: f.nome, entrada, saida, ms: Date.now() - t0 });
              return saida;
            } catch (e) {
              const erro = e instanceof Error ? e.message : String(e);
              chamadas.push({ nome: f.nome, entrada, saida: "", ms: Date.now() - t0, erro });
              return `Erro ao executar a ferramenta ${f.nome}: ${erro}`;
            } finally {
              pedido.aoFerramenta?.(f.nome, "fim");
            }
          },
        }),
      );

      try {
        const runner = anthropic.beta.messages.toolRunner({
          model: pedido.modelo,
          max_tokens: pedido.maxTokens ?? 4096,
          system: blocoSistema(pedido.sistema, pedido.cacheSistema),
          messages: pedido.mensagens,
          tools: ferramentas,
          max_iterations: pedido.maxIteracoes ?? 8,
          stream: true,
          ...(pedido.effort ? { output_config: { effort: pedido.effort } } : {}),
        });

        const novasMensagens: MensagemIa[] = [];
        let uso = USO_ZERO;
        let ultimaMensagem: Anthropic.Beta.Messages.BetaMessage | null = null;
        for await (const stream of runner) {
          if (pedido.aoTexto) stream.on("text", (delta) => pedido.aoTexto?.(delta));
          const mensagem = await stream.finalMessage();
          ultimaMensagem = mensagem;
          uso = somarUso(uso, usoDaMensagem(mensagem));
          novasMensagens.push({ role: "assistant", content: mensagem.content });
          if (mensagem.stop_reason === "refusal") {
            throw new ErroIa("recusado", "O modelo recusou a tarefa", { uso });
          }
          if (mensagem.stop_reason === "max_tokens" && mensagem.content.some((b) => b.type === "tool_use")) {
            throw new ErroIa("erro", "Resposta truncada no meio de uma chamada de ferramenta (max_tokens)", { uso });
          }
          const respostaFerramentas = await runner.generateToolResponse();
          if (respostaFerramentas) novasMensagens.push(respostaFerramentas);
        }
        if (!ultimaMensagem) throw new ErroIa("erro", "A conversa terminou sem resposta do modelo");
        return {
          novasMensagens,
          texto: textoDaMensagem(ultimaMensagem.content),
          uso,
          chamadas,
          modelo: ultimaMensagem.model,
          latenciaMs: Date.now() - inicio,
          requestId: (ultimaMensagem as { _request_id?: string | null })._request_id ?? null,
          stopReason: ultimaMensagem.stop_reason,
        };
      } catch (e) {
        if (e instanceof ErroIa) throw e;
        throw new ErroIa("erro", e instanceof Error ? e.message : String(e), e);
      }
    },
  };
}

/** Roteiro de uma conversa falsa: chamadas de ferramenta (executadas de verdade) e o texto final. */
export type PassoFalso = { ferramenta: string; entrada: unknown } | { texto: string };

/**
 * Cliente falso para testes e para o modo sem chave.
 * - `respostas`: por agente, a saída estruturada (objeto ou função do pedido).
 * - `conversas`: por agente, o roteiro de `conversar` (as ferramentas são executadas de verdade, com a entrada dada).
 */
export function criarClienteIaFalso(
  respostas: Record<string, unknown | ((pedido: PedidoEstruturado<z.ZodType>) => unknown)>,
  conversas: Record<string, PassoFalso[] | ((pedido: PedidoConversa) => PassoFalso[])> = {},
): ClienteIa & { chamadas: PedidoEstruturado<z.ZodType>[]; conversasFeitas: PedidoConversa[] } {
  const chamadas: PedidoEstruturado<z.ZodType>[] = [];
  const conversasFeitas: PedidoConversa[] = [];
  return {
    chamadas,
    conversasFeitas,
    async gerarEstruturado(pedido) {
      chamadas.push(pedido as PedidoEstruturado<z.ZodType>);
      const r = respostas[pedido.agente];
      if (r === undefined) throw new ErroIa("erro", `Sem resposta falsa para o agente ${pedido.agente}`);
      const bruto = typeof r === "function" ? (r as (p: PedidoEstruturado<z.ZodType>) => unknown)(pedido as PedidoEstruturado<z.ZodType>) : r;
      const parsed = pedido.schema.safeParse(bruto);
      if (!parsed.success) throw new ErroIa("invalido_schema", "Resposta falsa não bate com o schema", parsed.error.issues);
      return { dados: parsed.data, uso: { input: 1000, output: 200, cacheWrite: 0, cacheRead: 0 }, modelo: pedido.modelo, latenciaMs: 5, requestId: "falso", stopReason: "end_turn" };
    },
    async conversar(pedido) {
      conversasFeitas.push(pedido);
      const roteiroBruto = conversas[pedido.agente];
      if (roteiroBruto === undefined) throw new ErroIa("erro", `Sem roteiro falso para o agente ${pedido.agente}`);
      const roteiro = typeof roteiroBruto === "function" ? roteiroBruto(pedido) : roteiroBruto;
      const novasMensagens: MensagemIa[] = [];
      const chamadasFeitas: ChamadaFerramenta[] = [];
      let texto = "";
      let n = 0;
      for (const passo of roteiro) {
        if ("texto" in passo) {
          texto = passo.texto;
          novasMensagens.push({ role: "assistant", content: [{ type: "text", text: passo.texto }] });
          pedido.aoTexto?.(passo.texto);
          break;
        }
        const f = pedido.ferramentas.find((x) => x.nome === passo.ferramenta);
        if (!f) throw new ErroIa("erro", `Ferramenta ${passo.ferramenta} não está disponível nesta conversa`);
        const entrada = f.schema.safeParse(passo.entrada);
        if (!entrada.success) throw new ErroIa("invalido_schema", `Entrada falsa inválida para ${f.nome}`, entrada.error.issues);
        const id = `toolu_falso_${++n}`;
        novasMensagens.push({ role: "assistant", content: [{ type: "tool_use", id, name: f.nome, input: entrada.data }] });
        const t0 = Date.now();
        pedido.aoFerramenta?.(f.nome, "inicio");
        let saida: string;
        try {
          saida = await f.executar(entrada.data);
          chamadasFeitas.push({ nome: f.nome, entrada: entrada.data, saida, ms: Date.now() - t0 });
        } catch (e) {
          const erro = e instanceof Error ? e.message : String(e);
          saida = `Erro ao executar a ferramenta ${f.nome}: ${erro}`;
          chamadasFeitas.push({ nome: f.nome, entrada: entrada.data, saida: "", ms: Date.now() - t0, erro });
        } finally {
          pedido.aoFerramenta?.(f.nome, "fim");
        }
        novasMensagens.push({ role: "user", content: [{ type: "tool_result", tool_use_id: id, content: saida }] });
      }
      return { novasMensagens, texto, uso: { input: 1000 * (n + 1), output: 200, cacheWrite: 0, cacheRead: n > 0 ? 900 : 0 }, chamadas: chamadasFeitas, modelo: pedido.modelo, latenciaMs: 5, requestId: "falso", stopReason: "end_turn" };
    },
  };
}
