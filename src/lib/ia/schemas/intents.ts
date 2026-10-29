import { z } from "zod";

/**
 * Intents fechados do roteador. A v0 (WhatsApp) tinha os dez primeiros; a v1 (painel) acrescenta os de
 * pergunta livre, abertura de agente, jurisprudência e cálculo. O WhatsApp continua respondendo só a
 * INTENTS_WHATSAPP e trata os demais como fora_do_escopo.
 */
export const INTENTS = [
  "resumo_do_dia",
  "prazos_semana",
  "prazos_hoje_amanha",
  "movimentos_processo",
  "tarefas_pessoa",
  "reatribuir_tarefa",
  "concluir_tarefa",
  "confirmar_prazo",
  "saudacao",
  "fora_do_escopo",
  "pergunta_livre",
  "abrir_agente",
  "buscar_jurisprudencia",
  "calcular",
] as const;
export type Intent = (typeof INTENTS)[number];

export const INTENTS_WHATSAPP: Intent[] = ["resumo_do_dia", "prazos_semana", "prazos_hoje_amanha", "movimentos_processo", "tarefas_pessoa", "reatribuir_tarefa", "concluir_tarefa", "confirmar_prazo", "saudacao", "fora_do_escopo"];

export const INTENTS_DE_ESCRITA: Intent[] = ["reatribuir_tarefa", "concluir_tarefa", "confirmar_prazo"];

/** Agentes que o painel abre a partir do chat (telas dos lotes seguintes). */
export const AGENTES_ABRIVEIS = ["honorarios", "peticao", "varredura", "revisor", "julgador", "outros_tribunais", "calculo", "jurisprudencia"] as const;
export type AgenteAbrivel = (typeof AGENTES_ABRIVEIS)[number];

export const RoteamentoIntentSchema = z.object({
  intent: z.enum(INTENTS),
  confianca: z.number().min(0).max(1),
  entidades: z.object({
    processo: z.string().nullable().describe("Número (completo ou parcial) ou nome de cliente/parte mencionado"),
    pessoa: z.string().nullable().describe("Nome da pessoa da equipe mencionada (para reatribuir ou listar tarefas)"),
    tarefa: z.string().nullable().describe("Descrição da tarefa mencionada (ex.: 'réplica')"),
    periodo: z.enum(["hoje", "amanha", "semana", "outro"]).nullable(),
    data: z.string().nullable().describe("Data mencionada, YYYY-MM-DD, se houver"),
    agente: z.enum(AGENTES_ABRIVEIS).nullable().describe("Para abrir_agente: qual agente a pessoa quer (contrato/honorários, petição, varredura dos autos, revisor, julgador, outros tribunais, cálculo, jurisprudência)"),
  }),
  resposta_curta: z.string().max(300).nullable().describe("Para saudacao e fora_do_escopo: resposta curta e educada em português; senão null"),
});

export type RoteamentoIntent = z.infer<typeof RoteamentoIntentSchema>;
