import type { z } from "zod";
import { SISTEMA as SISTEMA_JULGADOR, VERSAO as VERSAO_JULGADOR } from "../prompts/julgador.v1";
import { SISTEMA as SISTEMA_OUTROS, VERSAO as VERSAO_OUTROS } from "../prompts/outros-tribunais.v1";
import { JulgadorSchema } from "../schemas/julgador";
import { OutrosTribunaisSchema } from "../schemas/outros-tribunais";

/**
 * Agentes que a avaliação sabe rodar (lote 10). Cada entrada liga o nome do registro (src/lib/ia/agentes/registro.ts)
 * ao prompt e ao schema de saída. Para acrescentar um agente: prompt, schema, entrada aqui e pasta em tests/avaliacao.
 */
export const SCHEMAS_AVALIACAO: Record<string, z.ZodType> = {
  OutrosTribunaisSchema,
  JulgadorSchema,
};

export interface AgenteAvaliavel {
  versao: string;
  sistema: string;
  schema: z.ZodType;
}

export const AGENTES_AVALIAVEIS: Record<string, AgenteAvaliavel> = {
  outros_tribunais: { versao: VERSAO_OUTROS, sistema: SISTEMA_OUTROS, schema: OutrosTribunaisSchema },
  julgador: { versao: VERSAO_JULGADOR, sistema: SISTEMA_JULGADOR, schema: JulgadorSchema },
};
