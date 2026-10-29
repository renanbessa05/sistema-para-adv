import { z } from "zod";

/** Saída do agente de outros tribunais (skill analise-processual-todos-tribunais, Partes I e II). */
export const OutrosTribunaisSchema = z.object({
  tribunal: z.string().describe("Sigla do tribunal identificado pelo número CNJ (ex.: TJSP)"),
  camada_local: z.array(
    z.object({
      bloco: z.number().int().min(1).max(8),
      item: z.string(),
      situacao: z.enum(["confirmado", "a_verificar"]),
      fonte: z.string().nullable().describe("Fonte oficial ou o documento dos autos; null quando a verificar"),
    }),
  ),
  mapa: z.object({
    partes: z.string(),
    objeto: z.string(),
    pedidos: z.string(),
    valor_causa: z.string().nullable(),
    juizo: z.string().describe("Comarca, vara e competência, como estão nos autos"),
    ultima_peca_pendente: z.string(),
  }),
  pontos: z.array(
    z.object({
      numero: z.number().int(),
      titulo: z.string(),
      eixo: z.enum(["A", "B", "C", "D", "E", "F"]),
      fundamento: z.string(),
      onde_nos_autos: z.string(),
      resposta_adversario: z.string(),
      solidez: z.enum(["sólida", "arriscada", "inviável"]),
      prioridade: z.enum(["decisiva", "relevante", "complementar"]),
      depende_regra_local: z.boolean(),
      regra_local_confirmada: z.boolean().nullable(),
    }),
  ),
  ordem_argumentativa: z.array(z.string()),
  descartados: z.array(z.object({ ponto: z.string(), motivo: z.string() })),
  lacunas: z.array(z.string()),
  conteudo_md: z.string().describe("Relatório completo em Markdown, na ordem do formato de saída da skill"),
});

export type OutrosTribunais = z.infer<typeof OutrosTribunaisSchema>;
