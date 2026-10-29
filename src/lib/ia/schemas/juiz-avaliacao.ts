import { z } from "zod";

/** Veredito do juiz de avaliação (agente juiz_avaliacao): aprova ou reprova uma saída contra um critério. */
export const VeredictoSchema = z.object({
  aprova: z.boolean(),
  motivo: z.string().min(1).max(400).describe("Uma frase, citando o trecho da saída que decidiu"),
});

export type Veredicto = z.infer<typeof VeredictoSchema>;
