import { z } from "zod";

/**
 * Intents do atendimento ao cliente (WhatsApp, lote 14). Lista fechada e pequena.
 * - andamento_processo: leitura, respondida só por template fixo (sem conteúdo de processo).
 * - falar_com_advogado: vira tarefa e notificação para a equipe.
 * - outro: pergunta livre; a IA redige uma resposta que só sai após aprovação humana.
 */
export const INTENTS_CLIENTE = ["saudacao", "andamento_processo", "falar_com_advogado", "outro", "fora_do_escopo"] as const;
export type IntentCliente = (typeof INTENTS_CLIENTE)[number];

export const RoteamentoClienteSchema = z.object({
  intent: z.enum(INTENTS_CLIENTE),
  confianca: z.number().min(0).max(1),
});
export type RoteamentoCliente = z.infer<typeof RoteamentoClienteSchema>;

export const RespostaClienteSchema = z.object({
  texto: z.string().min(1).max(600).describe("Resposta curta e educada, em português, sem prazo, horário, valor ou opinião jurídica"),
  depende_de_advogado: z.boolean().describe("true quando a resposta exige avaliação de advogado ou informação que a IA não tem"),
});
export type RespostaCliente = z.infer<typeof RespostaClienteSchema>;
