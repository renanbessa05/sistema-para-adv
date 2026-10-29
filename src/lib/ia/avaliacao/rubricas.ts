import { z } from "zod";
import { delimitarDado } from "../custo";
import { SISTEMA as SISTEMA_JUIZ } from "../prompts/juiz-avaliacao.v1";
import type { Veredicto } from "../schemas/juiz-avaliacao";

/**
 * Rubricas da avaliação de agentes (lote 10). Puras: recebem a saída pronta e devolvem ok e motivo.
 * - contem / nao_contem: texto presente ou ausente (sem diferenciar maiúsculas, acento nem espaços repetidos).
 * - regex: padrão presente (deve_casar true) ou ausente (deve_casar false). Flags padrão "i".
 * - schema: a saída passa no schema Zod registrado em SCHEMAS_AVALIACAO (referência pelo nome).
 * - juiz: um modelo confere o critério; o veredito chega de fora, já validado pelo schema do juiz.
 * `campo` aponta uma chave de primeiro nível da saída; sem ele a rubrica vale para a saída inteira (JSON).
 */

export const RUBRICA_SCHEMA = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("contem"), texto: z.string().min(1), campo: z.string().optional(), descricao: z.string().optional() }),
  z.object({ tipo: z.literal("nao_contem"), texto: z.string().min(1), campo: z.string().optional(), descricao: z.string().optional() }),
  z.object({
    tipo: z.literal("regex"),
    padrao: z.string().min(1),
    flags: z.string().regex(/^[imsu]*$/).optional(),
    deve_casar: z.boolean(),
    campo: z.string().optional(),
    descricao: z.string().optional(),
  }),
  z.object({ tipo: z.literal("schema"), schema: z.string().min(1), descricao: z.string().optional() }),
  z.object({ tipo: z.literal("juiz"), criterio: z.string().min(1), descricao: z.string().optional() }),
]);

export type Rubrica = z.infer<typeof RUBRICA_SCHEMA>;

export interface ResultadoRubrica {
  tipo: Rubrica["tipo"];
  descricao: string | null;
  ok: boolean;
  motivo: string;
}

export interface OpcoesRubrica {
  /** Schemas Zod por nome (as rubricas `schema` referenciam pelo nome). */
  schemas: Record<string, z.ZodType>;
  /** Vereditos do juiz, por critério. Critério sem veredito reprova a rubrica. */
  veredictos?: Record<string, Veredicto>;
}

/** Texto da saída (ou do campo) para as rubricas de texto. */
export function textoParaRubrica(saida: unknown, campo?: string): string {
  if (campo === undefined) return JSON.stringify(saida) ?? "";
  const valor = (saida as Record<string, unknown> | null)?.[campo];
  if (valor === undefined) return "";
  return typeof valor === "string" ? valor : (JSON.stringify(valor) ?? "");
}

/** Forma de comparação: minúsculas, sem acento e com espaços colapsados. */
export function normalizarParaBusca(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ");
}

export function avaliarRubrica(rubrica: Rubrica, saida: unknown, opcoes: OpcoesRubrica): ResultadoRubrica {
  const descricao = rubrica.descricao ?? null;
  const base = { tipo: rubrica.tipo, descricao };
  switch (rubrica.tipo) {
    case "contem":
    case "nao_contem": {
      const quem = rubrica.campo ?? "saída";
      const presente = normalizarParaBusca(textoParaRubrica(saida, rubrica.campo)).includes(normalizarParaBusca(rubrica.texto));
      const ok = rubrica.tipo === "contem" ? presente : !presente;
      const motivo = ok ? `ok em ${quem}` : rubrica.tipo === "contem" ? `falta "${rubrica.texto}" em ${quem}` : `não deveria conter "${rubrica.texto}" em ${quem}`;
      return { ...base, ok, motivo };
    }
    case "regex": {
      let casa: boolean;
      try {
        casa = new RegExp(rubrica.padrao, rubrica.flags ?? "i").test(textoParaRubrica(saida, rubrica.campo));
      } catch {
        return { ...base, ok: false, motivo: `padrão inválido: ${rubrica.padrao}` };
      }
      const quem = rubrica.campo ?? "saída";
      const ok = casa === rubrica.deve_casar;
      const motivo = ok ? `ok em ${quem}` : rubrica.deve_casar ? `padrão não encontrado em ${quem}` : `padrão proibido encontrado em ${quem}`;
      return { ...base, ok, motivo };
    }
    case "schema": {
      const schema = opcoes.schemas[rubrica.schema];
      if (!schema) return { ...base, ok: false, motivo: `schema desconhecido: ${rubrica.schema}` };
      const r = schema.safeParse(saida);
      if (r.success) return { ...base, ok: true, motivo: `ok no schema ${rubrica.schema}` };
      const primeiro = r.error.issues[0];
      const caminho = primeiro && primeiro.path.length ? primeiro.path.join(".") : "(raiz)";
      return { ...base, ok: false, motivo: `fora do schema ${rubrica.schema}: ${caminho} ${primeiro?.message ?? ""}`.trim() };
    }
    case "juiz": {
      const veredicto = opcoes.veredictos?.[rubrica.criterio];
      if (!veredicto) return { ...base, ok: false, motivo: "juiz não avaliou este critério" };
      return { ...base, ok: veredicto.aprova, motivo: veredicto.motivo };
    }
  }
}

/** Pedido ao juiz de avaliação: o critério vai no texto do usuário; a saída do agente entra delimitada como dado. */
export function montarPedidoJuiz(criterio: string, saida: unknown): { sistema: string; usuario: string } {
  return {
    sistema: SISTEMA_JUIZ,
    usuario: `Critério: ${criterio}\n\n${delimitarDado("saida_agente", JSON.stringify(saida, null, 2))}`,
  };
}
