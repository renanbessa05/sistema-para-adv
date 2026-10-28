import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

/**
 * Cliente de IA do sistema. Toda chamada tem saída estruturada (schema Zod), registra uso de tokens
 * e nunca executa ações: devolve dados que o código valida e grava só após confirmação humana.
 */

export interface UsoTokens {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

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
  /** Prompt de sistema. Marcado para cache quando `cacheSistema` for true (mínimo de 512 tokens para valer). */
  sistema: string;
  cacheSistema?: boolean;
  /** Mensagem do usuário. Texto de terceiros deve vir delimitado como dado pelo chamador. */
  usuario: string;
  schema: T;
  maxTokens?: number;
  /** Só para modelos que aceitam o parâmetro; os Claude 5 não aceitam e o padrão é não enviar. */
  temperatura?: number;
  agente: string;
}

export interface ClienteIa {
  gerarEstruturado<T extends z.ZodType>(pedido: PedidoEstruturado<T>): Promise<RespostaEstruturada<z.infer<T>>>;
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

export function criarClienteIa(opcoes: { apiKey: string; baseURL?: string; fetchImpl?: typeof fetch; timeoutMs?: number }): ClienteIa {
  const anthropic = new Anthropic({
    apiKey: opcoes.apiKey,
    baseURL: opcoes.baseURL,
    fetch: opcoes.fetchImpl,
    timeout: opcoes.timeoutMs ?? 60_000,
    maxRetries: 2,
  });

  return {
    async gerarEstruturado(pedido) {
      const inicio = Date.now();
      try {
        const resposta = await anthropic.messages.parse({
          model: pedido.modelo,
          max_tokens: pedido.maxTokens ?? 1024,
          // Os modelos Claude 5 rejeitam `temperature` ("Extra inputs are not permitted"); só enviamos quando pedido.
          ...(pedido.temperatura !== undefined ? { temperature: pedido.temperatura } : {}),
          system: [
            {
              type: "text",
              text: pedido.sistema,
              ...(pedido.cacheSistema ? { cache_control: { type: "ephemeral" as const } } : {}),
            },
          ],
          messages: [{ role: "user", content: pedido.usuario }],
          output_config: { format: zodOutputFormat(pedido.schema) },
        });
        const latenciaMs = Date.now() - inicio;
        const u = resposta.usage;
        const uso: UsoTokens = {
          input: u.input_tokens ?? 0,
          output: u.output_tokens ?? 0,
          cacheWrite: u.cache_creation_input_tokens ?? 0,
          cacheRead: u.cache_read_input_tokens ?? 0,
        };
        if (resposta.stop_reason === "refusal") {
          throw new ErroIa("recusado", "O modelo recusou a tarefa", { uso });
        }
        const dados = resposta.parsed_output;
        if (dados === null || dados === undefined) {
          throw new ErroIa("invalido_schema", "Resposta sem saída estruturada válida", { stop_reason: resposta.stop_reason, uso });
        }
        return { dados, uso, modelo: resposta.model, latenciaMs, requestId: resposta._request_id ?? null, stopReason: resposta.stop_reason };
      } catch (e) {
        if (e instanceof ErroIa) throw e;
        throw new ErroIa("erro", e instanceof Error ? e.message : String(e), e);
      }
    },
  };
}

/** Cliente falso para testes e para o modo sem chave: devolve respostas fixas por agente. */
export function criarClienteIaFalso(respostas: Record<string, unknown | ((pedido: PedidoEstruturado<z.ZodType>) => unknown)>): ClienteIa & { chamadas: PedidoEstruturado<z.ZodType>[] } {
  const chamadas: PedidoEstruturado<z.ZodType>[] = [];
  return {
    chamadas,
    async gerarEstruturado(pedido) {
      chamadas.push(pedido as PedidoEstruturado<z.ZodType>);
      const r = respostas[pedido.agente];
      if (r === undefined) throw new ErroIa("erro", `Sem resposta falsa para o agente ${pedido.agente}`);
      const bruto = typeof r === "function" ? (r as (p: PedidoEstruturado<z.ZodType>) => unknown)(pedido as PedidoEstruturado<z.ZodType>) : r;
      const parsed = pedido.schema.safeParse(bruto);
      if (!parsed.success) throw new ErroIa("invalido_schema", "Resposta falsa não bate com o schema", parsed.error.issues);
      return { dados: parsed.data, uso: { input: 1000, output: 200, cacheWrite: 0, cacheRead: 0 }, modelo: pedido.modelo, latenciaMs: 5, requestId: "falso", stopReason: "end_turn" };
    },
  };
}
