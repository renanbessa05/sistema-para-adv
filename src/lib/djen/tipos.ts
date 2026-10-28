import { z } from "zod";

/**
 * Tipos da API do DJEN (Comunica PJe): `GET https://comunicaapi.pje.jus.br/api/v1/comunicacao`.
 *
 * Os schemas são permissivos (`looseObject`): campos desconhecidos passam sem erro,
 * porque a API não é versionada para nós e novos campos aparecem sem aviso.
 * Só `id` e `hash` são obrigatórios; todo o resto é opcional/nullable.
 *
 * Fatos verificados em docs/escopo-revisado.md, Apêndice A.1. Suposições estão
 * marcadas com "(a confirmar na API real)".
 */

/** Aceita número ou string numérica e devolve string; null/undefined passam. */
const textoOuNumero = z.union([z.string(), z.number()]).transform((v) => String(v));

export const DestinatarioDjenSchema = z.looseObject({
  nome: z.string().nullish(),
  /** "A" = polo ativo, "P" = polo passivo (a confirmar na API real; há relatos de outros valores). */
  polo: z.string().nullish(),
  comunicacao_id: z.number().nullish(),
});

export const AdvogadoDjenSchema = z.looseObject({
  id: z.number().nullish(),
  nome: z.string().nullish(),
  numero_oab: textoOuNumero.nullish(),
  uf_oab: z.string().nullish(),
});

export const DestinatarioAdvogadoDjenSchema = z.looseObject({
  id: z.number().nullish(),
  comunicacao_id: z.number().nullish(),
  advogado: AdvogadoDjenSchema.nullish(),
});

export const ItemDjenSchema = z.looseObject({
  id: z.number(),
  hash: z.string(),
  /** "YYYY-MM-DD". */
  data_disponibilizacao: z.string().nullish(),
  /** "DD/MM/YYYY" (mesma data em outro formato). */
  datadisponibilizacao: z.string().nullish(),
  siglaTribunal: z.string().nullish(),
  /** Ex.: "Intimação", "Citação", "Edital" (a confirmar na API real a lista completa). */
  tipoComunicacao: z.string().nullish(),
  /** Ex.: "Despacho", "Decisão", "Sentença", "Ato ordinatório". */
  tipoDocumento: z.string().nullish(),
  nomeOrgao: z.string().nullish(),
  idOrgao: z.number().nullish(),
  /** HTML. */
  texto: z.string().nullish(),
  /** 20 dígitos sem máscara. */
  numero_processo: z.string().nullish(),
  numeroprocessocommascara: z.string().nullish(),
  /** "D" = diário, "E" = edital. */
  meio: z.string().nullish(),
  meiocompleto: z.string().nullish(),
  link: z.string().nullish(),
  nomeClasse: z.string().nullish(),
  codigoClasse: textoOuNumero.nullish(),
  numeroComunicacao: z.number().nullish(),
  ativo: z.boolean().nullish(),
  /** Ex.: "P" (publicada). Outros valores (a confirmar na API real); "C" tratado como cancelada. */
  status: z.string().nullish(),
  motivo_cancelamento: z.string().nullish(),
  data_cancelamento: z.string().nullish(),
  destinatarios: z.array(DestinatarioDjenSchema).nullish(),
  destinatarioadvogados: z.array(DestinatarioAdvogadoDjenSchema).nullish(),
});

export const RespostaDjenSchema = z.looseObject({
  status: z.string().nullish(),
  message: z.string().nullish(),
  count: z.number().nullish(),
  items: z.array(ItemDjenSchema),
});

/** Item de `GET /api/v1/comunicacao/tribunal`. Formato (a confirmar na API real). */
export const TribunalDjenSchema = z.looseObject({
  sigla: z.string().nullish(),
  nome: z.string().nullish(),
});

export type DestinatarioDjen = z.infer<typeof DestinatarioDjenSchema>;
export type AdvogadoDjen = z.infer<typeof AdvogadoDjenSchema>;
export type DestinatarioAdvogadoDjen = z.infer<typeof DestinatarioAdvogadoDjenSchema>;
export type ItemDjen = z.infer<typeof ItemDjenSchema>;
export type RespostaDjen = z.infer<typeof RespostaDjenSchema>;
export type TribunalDjen = z.infer<typeof TribunalDjenSchema>;

/** Parâmetros aceitos por `consultar`. Nomes espelham o Swagger v1.0.4. */
export interface ParametrosConsultaDjen {
  numeroOab?: string | number;
  ufOab?: string;
  nomeAdvogado?: string;
  nomeParte?: string;
  /** Com ou sem máscara; é enviado com 20 dígitos. */
  numeroProcesso?: string;
  texto?: string;
  siglaTribunal?: string;
  /** YYYY-MM-DD. */
  dataDisponibilizacaoInicio?: string;
  /** YYYY-MM-DD. */
  dataDisponibilizacaoFim?: string;
  /** "D" diário | "E" edital. */
  meio?: "D" | "E";
  /** O Swagger só aceita 5 ou 100 (padrão 100). */
  itensPorPagina?: 5 | 100;
  pagina?: number;
}

/**
 * Publicação do DJEN já no formato interno, pronta para a tabela `publicacoes`.
 * Datas em "YYYY-MM-DD"; textos sem HTML; o item original fica em `payload_bruto`.
 */
export interface PublicacaoNormalizada {
  fonte: "djen";
  /** `String(item.id)`: chave primária de deduplicação. */
  id_externo: string;
  hash_djen: string;
  /** 20 dígitos, ou null quando a publicação não traz número de processo reconhecível. */
  numero_cnj: string | null;
  /** Número como veio (com máscara, se houver). */
  numero_processo_texto: string | null;
  tribunal_sigla: string | null;
  /** `tipoComunicacao` (Intimação, Citação, ...). */
  tipo_origem: string | null;
  tipo_documento: string | null;
  orgao: string | null;
  classe_nome: string | null;
  classe_codigo: string | null;
  meio: string | null;
  data_disponibilizacao: string | null;
  /** Texto simples (HTML removido, entidades decodificadas, espaços normalizados). */
  texto: string;
  texto_html: string | null;
  link: string | null;
  destinatarios: Array<{ nome: string | null; polo: string | null }>;
  destinatario_advogados: Array<{ nome: string | null; numero_oab: string | null; uf_oab: string | null }>;
  ativo: boolean | null;
  status: string | null;
  cancelada: boolean;
  motivo_cancelamento: string | null;
  data_cancelamento: string | null;
  numero_comunicacao: number | null;
  payload_bruto: ItemDjen;
}
