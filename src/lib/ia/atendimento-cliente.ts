import type { ClienteIa, RespostaEstruturada } from "./cliente";
import { delimitarDado } from "./custo";
import { SISTEMA as SISTEMA_ROTEADOR, VERSAO as VERSAO_ROTEADOR } from "./prompts/roteador-cliente.v1";
import { SISTEMA as SISTEMA_RESPOSTA, VERSAO as VERSAO_RESPOSTA } from "./prompts/resposta-cliente.v1";
import { RespostaClienteSchema, RoteamentoClienteSchema, type RespostaCliente, type RoteamentoCliente } from "./schemas/intents-cliente";

export const AGENTE_ROTEADOR_CLIENTE = "roteador_cliente";
export const AGENTE_RESPOSTA_CLIENTE = "resposta_cliente";

export interface ResultadoRoteamentoCliente extends RespostaEstruturada<RoteamentoCliente> {
  agenteVersao: string;
}

export interface ResultadoRespostaCliente extends RespostaEstruturada<RespostaCliente> {
  agenteVersao: string;
}

/** Classifica a mensagem de um cliente. A mensagem entra delimitada como dado (CLAUDE.md, regra de texto externo). */
export async function rotearMensagemCliente(texto: string, deps: { cliente: ClienteIa; modelo: string }): Promise<ResultadoRoteamentoCliente> {
  const resposta = await deps.cliente.gerarEstruturado({
    agente: AGENTE_ROTEADOR_CLIENTE,
    modelo: deps.modelo,
    sistema: SISTEMA_ROTEADOR,
    cacheSistema: true,
    usuario: delimitarDado("mensagem_cliente_whatsapp", texto.slice(0, 1000)),
    schema: RoteamentoClienteSchema,
    maxTokens: 256,
  });
  return { ...resposta, agenteVersao: VERSAO_ROTEADOR };
}

/**
 * Rascunho de resposta livre. Recebe só o nome do escritório e a mensagem do cliente: nenhum dado de processo
 * entra aqui, então o modelo não tem como vazar conteúdo de autos (inclusive sigiloso).
 */
export async function redigirRespostaCliente(texto: string, deps: { cliente: ClienteIa; modelo: string; nomeEscritorio: string }): Promise<ResultadoRespostaCliente> {
  const resposta = await deps.cliente.gerarEstruturado({
    agente: AGENTE_RESPOSTA_CLIENTE,
    modelo: deps.modelo,
    sistema: SISTEMA_RESPOSTA,
    cacheSistema: true,
    usuario: `Escritório: ${deps.nomeEscritorio}\n\n${delimitarDado("mensagem_cliente_whatsapp", texto.slice(0, 1000))}`,
    schema: RespostaClienteSchema,
    maxTokens: 1024,
  });
  return { ...resposta, agenteVersao: VERSAO_RESPOSTA };
}
