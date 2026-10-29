import { z } from "zod";
import { FASES_PRONUNCIAMENTO } from "@/lib/analises/julgador";

/** Saída do agente julgador (skill tjmt-skill-cl). A montagem final e o aviso são feitos pelo código. */
export const JulgadorSchema = z.object({
  fase: z.enum(FASES_PRONUNCIAMENTO).describe("Pronunciamento cabível à fase real dos autos"),
  justificativa_fase: z.string().describe("Por que este pronunciamento e não outro, com a peça que define a fase"),
  ultima_peca_pendente: z.string(),
  mapa_md: z.string().describe("Mapa estratégico em seis seções (5.1 a 5.6), em Markdown"),
  minuta_md: z.string().describe("Minuta do pronunciamento, sem aviso final; vazia quando fase = sem_pronunciamento"),
  questoes_decisivas: z.array(z.string()),
  divergencias: z.array(z.string()).describe("Questões de corrente dividida: solução adotada e corrente contrária"),
  lacunas: z.array(z.string()),
});

export type Julgador = z.infer<typeof JulgadorSchema>;
