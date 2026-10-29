import { z } from "zod";

/** Ids fixos dos itens do checklist formal (checklist-formal.md, seções 1 a 13). */
export const ITENS_REVISAO = [
  "enderecamento",
  "competencia",
  "qualificacao",
  "oab",
  "email",
  "cnj",
  "valor_causa",
  "pedidos_infinitivo",
  "pedidos_correlacao",
  "tutela_art300",
  "docs",
  "documentos_indispensaveis",
  "recursos_tempestividade",
  "contestacao_impugnacao",
  "juizado_fazenda_12153",
  "fazenda_servidores_mt",
  "higiene_pje",
  "lacunas",
  "jurisprudencia",
  "tempestividade",
] as const;
export type ItemRevisao = (typeof ITENS_REVISAO)[number];

export const SituacaoRevisao = z.enum(["ok", "atencao", "critico", "nao_verificavel"]);

export const RevisaoSchema = z.object({
  veredito: z.string().max(400).describe("Uma frase: a peça está pronta, precisa de ajustes ou tem vício que a faz voltar"),
  mapa_argumentos: z
    .array(
      z.object({
        argumento: z.string().max(200),
        fato: z.string().max(200).nullable(),
        fundamento: z.string().max(200).nullable(),
        prova: z.string().max(200).nullable(),
        pedido: z.string().max(200).nullable(),
        classe: z.enum(["essencial", "relevante", "complementar", "dispensavel"]),
        justificativa: z.string().max(300),
      }),
    )
    .max(40),
  desconectados: z.array(z.string().max(200)).max(12),
  sintese_md: z.string().max(2000),
  dilui: z.array(z.string().max(300)).max(10),
  checklist: z
    .array(z.object({ id: z.enum(ITENS_REVISAO), situacao: SituacaoRevisao, observacao: z.string().max(300).nullable() }))
    .max(40),
  pendencias: z.array(z.string().max(300)).max(15),
  plano_acao: z.array(z.string().max(300)).max(15).describe("Em ordem de impacto"),
});

export type Revisao = z.infer<typeof RevisaoSchema>;
