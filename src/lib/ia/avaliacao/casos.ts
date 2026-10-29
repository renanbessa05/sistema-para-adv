import { z } from "zod";
import { VeredictoSchema } from "../schemas/juiz-avaliacao";
import { RUBRICA_SCHEMA } from "./rubricas";

/**
 * Formato de tests/avaliacao/<agente>/casos.json (lote 10).
 * - `entrada.usuario`: texto que vai ao agente no modo real (dados já delimitados por delimitarDado).
 * - `saidaFalsa`: saída usada no modo falso (sem API). Valida casos e rubricas, não o modelo.
 * - `juizFalso`: vereditos do juiz no modo falso, por critério (o texto é o mesmo do campo `criterio` da rubrica).
 * - `esperado`: "aprovado" (padrão) ou "reprovado" nos casos de controle negativo, que provam que a rubrica pega o erro.
 */
export const CasoSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  descricao: z.string().min(1),
  esperado: z.enum(["aprovado", "reprovado"]).default("aprovado"),
  entrada: z.object({ usuario: z.string().min(1) }),
  saidaFalsa: z.record(z.string(), z.unknown()),
  juizFalso: z.record(z.string(), VeredictoSchema).optional(),
  rubricas: z.array(RUBRICA_SCHEMA).min(1),
});

export const ArquivoCasosSchema = z.object({
  agente: z.string().min(1),
  casos: z.array(CasoSchema).min(1),
});

export type Caso = z.infer<typeof CasoSchema>;
export type ArquivoCasos = z.infer<typeof ArquivoCasosSchema>;
