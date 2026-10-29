import { z } from "zod";

/**
 * Saída do agente de honorários: só o DIAGNÓSTICO (Etapa 1 da skill). O cálculo (Etapa 2), a matriz de modalidade
 * (Etapa 3) e os documentos (Etapa 4) são código determinístico.
 */
export const NATUREZAS = ["civel", "empresarial", "consumidor", "servidor_publico", "fazenda_publica", "familia", "sucessoes", "locaticio", "expropriatorio", "trabalhista", "previdenciario", "fiscal", "criminal", "extrajudicial", "outra"] as const;
export const FASES = ["pre_processual", "conhecimento_postulatoria", "conhecimento_saneamento", "conhecimento_instrucao", "conhecimento_sentenca", "recursal", "cumprimento_sentenca", "execucao", "extrajudicial"] as const;

export const DiagnosticoHonorariosSchema = z.object({
  objeto: z.string().max(400).describe("Objeto da demanda em uma frase concreta (não genérica)"),
  natureza: z.enum(NATUREZAS),
  fase: z.enum(FASES),
  via: z.enum(["judicial", "extrajudicial"]),
  polo: z.string().max(60).describe("Autor/requerente, réu/requerido, exequente, executado, terceiro, assistente"),
  parte_contraria: z.string().max(200).nullable(),
  tipo_demanda: z.string().max(200).describe("Nome da ação ou do serviço, ex.: 'ação de indenização por danos morais'"),
  complexidade: z.enum(["baixa", "media", "alta"]),
  complexidade_justificativa: z.string().max(400).describe("Uma linha, pelos critérios do art. 49 do CED"),
  fatores_complexidade: z.array(z.string().max(120)).max(8).describe("Fatores presentes: litisconsórcio multitudinário, perícia, Fazenda no polo passivo, tese sem precedente, comarca distante, urgência, tribunal superior, IDPJ"),
  rubricas_sugeridas: z.array(z.string().max(60)).min(1).max(4).describe("Códigos da Tabela OAB/MT aplicáveis (ex.: IX.ordinario, VIII.cautelar), em ordem de relevância"),
  cautelar_satisfativa: z.boolean(),
  proveito_estimado: z.number().nonnegative().nullable().describe("Proveito econômico em reais, se apurável; senão null"),
  proveito_observacao: z.string().max(300).nullable().describe("Como foi estimado, ou por que é inestimável"),
  tese: z.enum(["solida", "incerta", "desconhecida"]),
  trabalho: z.enum(["pontual", "medio", "longo"]),
  titulo_formado: z.boolean().describe("Já existe título executivo, sentença transitada ou RPV a receber"),
  pedidos: z.array(z.string().max(200)).max(6).describe("Pedidos para a cláusula de objeto do contrato, em infinitivo"),
  poderes_especiais: z.array(z.enum(["grupo_economico", "cautelares_patrimoniais", "fazenda_publica", "sucessoes", "familia", "imobiliario", "previdenciario", "anulatorias"])).max(5),
  alertas: z.array(z.string().max(200)).max(6).describe("Pontos que a advogada precisa saber: gratuidade, pessoa jurídica, teto do art. 50, prazo, etc."),
  lacunas: z.array(z.string().max(120)).max(8).describe("Dados que faltam no relato para fechar o diagnóstico"),
});

export type DiagnosticoHonorarios = z.infer<typeof DiagnosticoHonorariosSchema>;
