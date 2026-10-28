import { z } from "zod";

export const TIPOS_PUBLICACAO = ["intimacao", "citacao", "despacho", "decisao", "sentenca", "acordao", "edital", "pauta", "outro"] as const;
export const CONTAGENS = ["dias_uteis", "dias_corridos", "horas"] as const;

/** Saída estruturada do classificador de publicações. Tudo aqui é sugestão: a advogada confirma. */
export const ClassificacaoPublicacaoSchema = z.object({
  tipo: z.enum(TIPOS_PUBLICACAO).describe("Natureza da comunicação"),
  gera_prazo: z.boolean().describe("true se a comunicação abre prazo para o advogado destinatário praticar ato"),
  ato: z.string().nullable().describe("Ato a praticar, em poucas palavras (ex.: 'contestar', 'apresentar réplica', 'recorrer'); null se não gera prazo"),
  dias_sugeridos: z.number().int().positive().nullable().describe("Quantidade de dias do prazo indicada no texto ou pela lei; null se não gera prazo ou não dá para saber"),
  contagem: z.enum(CONTAGENS).nullable().describe("Forma de contagem; dias_uteis para prazos processuais cíveis"),
  dobro: z.boolean().describe("true se o destinatário tem prazo em dobro (Fazenda, MP, Defensoria)"),
  numero_cnj: z.string().nullable().describe("Número do processo com 20 dígitos, sem máscara; null se não aparecer"),
  partes: z.array(z.object({ nome: z.string(), polo: z.enum(["ativo", "passivo", "terceiro", "outro"]) })).describe("Partes citadas no texto"),
  advogados_destinatarios: z.array(z.string()).describe("Nomes de advogados a quem a comunicação se dirige"),
  sugere_sigilo: z.boolean().describe("true se o texto indica segredo de justiça ou traz partes por iniciais"),
  resumo_simples: z.string().max(600).describe("Resumo em linguagem simples, 1 a 3 frases, para a equipe e para o WhatsApp"),
  confianca: z.number().min(0).max(1).describe("Confiança geral da classificação, de 0 a 1"),
  observacoes: z.string().nullable().describe("Dúvidas ou pontos a conferir; null se nenhum"),
});

export type ClassificacaoPublicacao = z.infer<typeof ClassificacaoPublicacaoSchema>;
