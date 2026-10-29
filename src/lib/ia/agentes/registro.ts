import type { Esforco } from "../cliente";

/**
 * Registro dos agentes de IA: nome, versão do prompt, qual variável de ambiente define o modelo, esforço e
 * limite de saída. O código que chama a API lê daqui; o modelo em si nunca fica fixo no código (CLAUDE.md).
 *
 * `modeloEnv` aponta para src/lib/config/env.ts (IA_MODELO_*). `effort` segue a API (`output_config.effort`).
 */

export type NomeAgente =
  | "classificador_publicacao"
  | "roteador_intents"
  | "assistente"
  | "honorarios"
  | "peticao"
  | "varredura"
  | "revisor"
  | "julgador"
  | "outros_tribunais"
  | "resposta_cliente"
  | "roteador_cliente"
  | "juiz_avaliacao";

export type ModeloEnv = "IA_MODELO_TRIAGEM" | "IA_MODELO_RESUMO" | "IA_MODELO_CHAT" | "IA_MODELO_PECAS" | "IA_MODELO_PECAS_FORTE";

export interface DefinicaoAgente {
  /** Versão do prompt em uso (igual ao VERSAO exportado por src/lib/ia/prompts/<agente>.vN.ts). */
  versao: string;
  modeloEnv: ModeloEnv;
  effort?: Esforco;
  maxTokens: number;
  /** Prompt de sistema vai com cache_control (vale a partir de 1024 tokens nos Claude 5). */
  cacheSistema: boolean;
  /** Produz conteúdo que entra em `aprovacoes` (minuta, contrato, cálculo, mensagem a cliente). */
  producao: boolean;
}

export const AGENTES: Record<NomeAgente, DefinicaoAgente> = {
  classificador_publicacao: { versao: "classificador-publicacao.v0", modeloEnv: "IA_MODELO_TRIAGEM", maxTokens: 1024, cacheSistema: true, producao: false },
  roteador_intents: { versao: "roteador-intents.v0", modeloEnv: "IA_MODELO_TRIAGEM", maxTokens: 512, cacheSistema: true, producao: false },
  assistente: { versao: "assistente.v1", modeloEnv: "IA_MODELO_CHAT", effort: "medium", maxTokens: 4096, cacheSistema: true, producao: false },
  honorarios: { versao: "honorarios.v1", modeloEnv: "IA_MODELO_PECAS", effort: "medium", maxTokens: 4096, cacheSistema: true, producao: true },
  peticao: { versao: "peticao.v1", modeloEnv: "IA_MODELO_PECAS", effort: "high", maxTokens: 16000, cacheSistema: true, producao: true },
  varredura: { versao: "varredura.v1", modeloEnv: "IA_MODELO_PECAS", effort: "high", maxTokens: 16000, cacheSistema: true, producao: true },
  revisor: { versao: "revisor.v1", modeloEnv: "IA_MODELO_PECAS_FORTE", effort: "high", maxTokens: 16000, cacheSistema: true, producao: false },
  julgador: { versao: "julgador.v1", modeloEnv: "IA_MODELO_PECAS_FORTE", effort: "high", maxTokens: 16000, cacheSistema: true, producao: false },
  outros_tribunais: { versao: "outros-tribunais.v1", modeloEnv: "IA_MODELO_PECAS", effort: "high", maxTokens: 16000, cacheSistema: true, producao: true },
  resposta_cliente: { versao: "resposta-cliente.v1", modeloEnv: "IA_MODELO_RESUMO", effort: "low", maxTokens: 1024, cacheSistema: true, producao: true },
  roteador_cliente: { versao: "roteador-cliente.v1", modeloEnv: "IA_MODELO_TRIAGEM", maxTokens: 512, cacheSistema: true, producao: false },
  juiz_avaliacao: { versao: "juiz-avaliacao.v1", modeloEnv: "IA_MODELO_TRIAGEM", maxTokens: 1024, cacheSistema: true, producao: false },
};

export function definicaoAgente(nome: NomeAgente): DefinicaoAgente {
  return AGENTES[nome];
}
