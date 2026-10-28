import { z } from "zod";

/** Lista fechada de intents do WhatsApp no MVP. Fora dela, o sistema responde "isso ainda não faço". */
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
] as const;
export type Intent = (typeof INTENTS)[number];

export const INTENTS_DE_ESCRITA: Intent[] = ["reatribuir_tarefa", "concluir_tarefa", "confirmar_prazo"];

export const RoteamentoIntentSchema = z.object({
  intent: z.enum(INTENTS),
  confianca: z.number().min(0).max(1),
  entidades: z.object({
    processo: z.string().nullable().describe("Número (completo ou parcial) ou nome de cliente/parte mencionado"),
    pessoa: z.string().nullable().describe("Nome da pessoa da equipe mencionada (para reatribuir ou listar tarefas)"),
    tarefa: z.string().nullable().describe("Descrição da tarefa mencionada (ex.: 'réplica')"),
    periodo: z.enum(["hoje", "amanha", "semana", "outro"]).nullable(),
    data: z.string().nullable().describe("Data mencionada, YYYY-MM-DD, se houver"),
  }),
  resposta_curta: z.string().max(300).nullable().describe("Para saudacao e fora_do_escopo: resposta curta e educada em português; senão null"),
});

export type RoteamentoIntent = z.infer<typeof RoteamentoIntentSchema>;
