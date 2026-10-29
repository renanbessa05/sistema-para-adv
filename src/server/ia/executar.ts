import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteIa, ErroIa, type ClienteIa, type RespostaConversa, type RespostaEstruturada, type UsoTokens } from "@/lib/ia/cliente";
import { AGENTES, type NomeAgente } from "@/lib/ia/agentes/registro";
import { envServidor } from "@/lib/config/env";
import { verificarTeto } from "./teto";

/**
 * Porta única para a API do Claude no servidor (docs/regras/agentes.md, regra 1):
 * 1. checa o teto mensal do escritório (toda chamada, não só a classificação);
 * 2. executa a função com o cliente de IA;
 * 3. grava `ia_execucoes` com tokens, custo (trigger), status e contexto, inclusive quando falha.
 * Nenhum outro módulo em src/server importa `criarClienteIa`.
 */

export interface ContextoExecucao {
  admin: SupabaseClient;
  escritorioId: string;
  agente: NomeAgente;
  /** Versão do prompt; por padrão a do registro do agente. */
  agenteVersao?: string;
  /** Objeto ao qual a execução se refere (publicacao, mensagem, minuta, contrato...). */
  objeto?: { tipo: string; id: string | null };
  conversaId?: string | null;
  /** Cliente a usar (testes); por padrão o cliente real com a chave do ambiente. */
  cliente?: ClienteIa | null;
  /** Modelo que substitui o do registro (ex.: redação final no modelo forte). */
  modelo?: string;
}

export interface ResultadoExecucao<T> {
  resultado: T;
  execucaoId: string | null;
  uso: UsoTokens;
  modelo: string;
}

let clienteCache: ClienteIa | null | undefined;

/** Cliente real com a chave do ambiente, ou null sem chave (o chamador decide o que fazer). */
export function clienteIaDoAmbiente(): ClienteIa | null {
  if (clienteCache !== undefined) return clienteCache;
  const env = envServidor();
  clienteCache = env.ANTHROPIC_API_KEY ? criarClienteIa({ apiKey: env.ANTHROPIC_API_KEY, timeoutMs: env.IA_TIMEOUT_MS }) : null;
  return clienteCache;
}

/** Modelo configurado para o agente (variável de ambiente do registro). */
export function modeloDoAgente(agente: NomeAgente): string {
  const env = envServidor();
  return env[AGENTES[agente].modeloEnv];
}

type Saida = RespostaEstruturada<unknown> | RespostaConversa;

function usoDe(r: Saida): UsoTokens {
  return r.uso;
}

/**
 * Executa `fn` com o cliente de IA e registra a execução. `fn` recebe o cliente e o modelo do agente e devolve a
 * resposta do cliente (gerarEstruturado ou conversar), para que o registro leia tokens, modelo e stop_reason.
 */
export async function executarAgente<T extends Saida>(ctx: ContextoExecucao, fn: (cliente: ClienteIa, modelo: string) => Promise<T>): Promise<ResultadoExecucao<T>> {
  const def = AGENTES[ctx.agente];
  const versao = ctx.agenteVersao ?? def.versao;
  const modelo = ctx.modelo ?? modeloDoAgente(ctx.agente);
  const cliente = ctx.cliente === undefined ? clienteIaDoAmbiente() : ctx.cliente;
  if (!cliente) throw new ErroIa("erro", "ANTHROPIC_API_KEY ausente: a assistente está sem modelo de IA configurado");

  const teto = await verificarTeto(ctx.admin, ctx.escritorioId);
  if (teto.atingido) {
    await registrar(ctx, { versao, modelo, status: "cancelado_teto", erro: `teto mensal de IA atingido (US$ ${teto.gastoUsd.toFixed(2)} de ${teto.tetoUsd.toFixed(2)})`, uso: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 } });
    throw new ErroIa("cancelado_teto", `Teto mensal de IA atingido (US$ ${teto.gastoUsd.toFixed(2)} de ${teto.tetoUsd.toFixed(2)}). Um sócio pode ajustar em Configurações → Integrações.`);
  }

  try {
    const resultado = await fn(cliente, modelo);
    const uso = usoDe(resultado);
    const execucaoId = await registrar(ctx, {
      versao,
      modelo: resultado.modelo,
      status: "ok",
      uso,
      latenciaMs: resultado.latenciaMs,
      requestId: resultado.requestId,
      stopReason: resultado.stopReason,
      ferramentas: "chamadas" in resultado ? resultado.chamadas.length : 0,
      effort: def.effort,
    });
    return { resultado, execucaoId, uso, modelo: resultado.modelo };
  } catch (e) {
    const tipo = e instanceof ErroIa ? e.tipo : "erro";
    const uso = (e instanceof ErroIa && (e.detalhe as { uso?: UsoTokens } | undefined)?.uso) || { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    await registrar(ctx, { versao, modelo, status: tipo, erro: e instanceof Error ? e.message : String(e), uso, effort: def.effort });
    throw e;
  }
}

async function registrar(
  ctx: ContextoExecucao,
  r: { versao: string; modelo: string; status: string; erro?: string; uso: UsoTokens; latenciaMs?: number; requestId?: string | null; stopReason?: string | null; ferramentas?: number; effort?: string },
): Promise<string | null> {
  const { data } = await ctx.admin
    .from("ia_execucoes")
    .insert({
      escritorio_id: ctx.escritorioId,
      agente: ctx.agente,
      agente_versao: r.versao,
      modelo: r.modelo,
      input_tokens: r.uso.input,
      output_tokens: r.uso.output,
      cache_creation_input_tokens: r.uso.cacheWrite,
      cache_read_input_tokens: r.uso.cacheRead,
      latencia_ms: r.latenciaMs ?? null,
      status: r.status,
      erro: r.erro ?? null,
      request_id: r.requestId ?? null,
      objeto_tipo: ctx.objeto?.tipo ?? null,
      objeto_id: ctx.objeto?.id ?? null,
      conversa_id: ctx.conversaId ?? null,
      ferramentas_chamadas: r.ferramentas ?? 0,
      stop_reason: r.stopReason ?? null,
      effort: r.effort ?? null,
    })
    .select("id")
    .single();
  return (data?.id as string | undefined) ?? null;
}
