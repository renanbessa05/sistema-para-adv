import type { ClienteIa, RespostaEstruturada } from "./cliente";
import { delimitarDado } from "./custo";
import { SISTEMA as SISTEMA_V0, VERSAO as VERSAO_V0 } from "./prompts/roteador-intents.v0";
import { SISTEMA as SISTEMA_V1, VERSAO as VERSAO_V1 } from "./prompts/roteador-intents.v1";
import { INTENTS_DE_ESCRITA, RoteamentoIntentSchema, type RoteamentoIntent } from "./schemas/intents";

export const AGENTE_ROTEADOR = "roteador_intents";

export interface ResultadoRoteamento extends RespostaEstruturada<RoteamentoIntent> {
  agente: string;
  agenteVersao: string;
  ehEscrita: boolean;
}

/** Atalhos determinísticos para mensagens óbvias: evitam chamada ao modelo. */
export function roteamentoRapido(texto: string): RoteamentoIntent | null {
  const t = texto.trim().toLowerCase();
  if (/^(bom dia|boa tarde|boa noite|oi|olá|ola|resumo)[!. ]*$/.test(t)) {
    return { intent: "resumo_do_dia", confianca: 0.95, entidades: { processo: null, pessoa: null, tarefa: null, periodo: "hoje", data: null, agente: null }, resposta_curta: null };
  }
  if (/^(obrigad[ao]|valeu|ok|beleza|certo)[!. ]*$/.test(t)) {
    return { intent: "saudacao", confianca: 0.95, entidades: { processo: null, pessoa: null, tarefa: null, periodo: null, data: null, agente: null }, resposta_curta: "De nada! Estou por aqui." };
  }
  return null;
}

/** Canal decide o prompt: v0 (lista fechada do WhatsApp) ou v1 (painel, com pergunta_livre e abrir_agente). */
export async function rotearMensagem(texto: string, deps: { cliente: ClienteIa; modelo: string; nomesDaEquipe?: string[]; canal?: "whatsapp" | "painel" }): Promise<ResultadoRoteamento> {
  const painel = deps.canal === "painel";
  const SISTEMA = painel ? SISTEMA_V1 : SISTEMA_V0;
  const VERSAO = painel ? VERSAO_V1 : VERSAO_V0;
  const rapido = roteamentoRapido(texto);
  if (rapido) {
    return {
      dados: rapido,
      uso: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
      modelo: "regra",
      latenciaMs: 0,
      requestId: null,
      stopReason: null,
      agente: AGENTE_ROTEADOR,
      agenteVersao: `${VERSAO}+regra`,
      ehEscrita: false,
    };
  }
  const contexto = deps.nomesDaEquipe?.length ? `Equipe: ${deps.nomesDaEquipe.join(", ")}\n\n` : "";
  const resposta = await deps.cliente.gerarEstruturado({
    agente: AGENTE_ROTEADOR,
    modelo: deps.modelo,
    sistema: SISTEMA,
    cacheSistema: true,
    usuario: `${contexto}${delimitarDado(painel ? "mensagem_painel" : "mensagem_whatsapp", texto.slice(0, 2000))}`,
    schema: RoteamentoIntentSchema,
    maxTokens: 400,
  });
  return { ...resposta, agente: AGENTE_ROTEADOR, agenteVersao: VERSAO, ehEscrita: INTENTS_DE_ESCRITA.includes(resposta.dados.intent) };
}
