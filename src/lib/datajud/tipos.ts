import { z } from "zod";

/**
 * Tipos da API Pública do DataJud (CNJ): `POST {base}/{alias}/_search`
 * com header `Authorization: APIKey <chave>`. A resposta é um envelope
 * Elasticsearch; o processo fica em `hits.hits[].\_source`.
 *
 * Schemas permissivos (`looseObject`): o DataJud muda sem aviso e campos
 * extras não devem derrubar a captação. Fatos verificados em
 * docs/escopo-revisado.md, A.2; suposições marcadas "(a confirmar na API real)".
 */

const codigoNome = z.looseObject({
  codigo: z.number().nullish(),
  nome: z.string().nullish(),
});

export const ComplementoTabeladoSchema = z.looseObject({
  codigo: z.number().nullish(),
  /** Nome do tipo de complemento, ex.: "tipo_de_audiencia" (a confirmar na API real). */
  descricao: z.string().nullish(),
  valor: z.number().nullish(),
  /** Descrição do valor, ex.: "Instrução e Julgamento". */
  nome: z.string().nullish(),
});

export const MovimentoDatajudSchema = z.looseObject({
  /** Código TPU do movimento. */
  codigo: z.number().nullish(),
  nome: z.string().nullish(),
  /** ISO 8601 ("2026-10-27T14:03:00.000Z") ou compacto "AAAAMMDDhhmmss" (a confirmar na API real). */
  dataHora: z.string().nullish(),
  complementosTabelados: z.array(ComplementoTabeladoSchema).nullish(),
  orgaoJulgador: z
    .looseObject({
      codigoOrgao: z.number().nullish(),
      nomeOrgao: z.string().nullish(),
    })
    .nullish(),
});

export const OrgaoJulgadorDatajudSchema = z.looseObject({
  codigo: z.number().nullish(),
  nome: z.string().nullish(),
  codigoMunicipioIBGE: z.number().nullish(),
});

export const ProcessoDatajudSourceSchema = z.looseObject({
  /** 20 dígitos sem máscara. */
  numeroProcesso: z.string(),
  tribunal: z.string().nullish(),
  classe: codigoNome.nullish(),
  assuntos: z.array(codigoNome).nullish(),
  sistema: codigoNome.nullish(),
  formato: codigoNome.nullish(),
  /** "G1", "G2", "JE", "TR" etc. (a confirmar na API real a lista completa). */
  grau: z.string().nullish(),
  dataAjuizamento: z.string().nullish(),
  dataHoraUltimaAtualizacao: z.string().nullish(),
  nivelSigilo: z.number().nullish(),
  orgaoJulgador: OrgaoJulgadorDatajudSchema.nullish(),
  movimentos: z.array(MovimentoDatajudSchema).nullish(),
  /** Metadado do DataJud: id do documento (a confirmar na API real). */
  id: z.string().nullish(),
  "@timestamp": z.string().nullish(),
});

export const HitDatajudSchema = z.looseObject({
  _index: z.string().nullish(),
  _id: z.string().nullish(),
  _score: z.number().nullish(),
  _source: ProcessoDatajudSourceSchema,
  sort: z.array(z.unknown()).nullish(),
});

export const RespostaDatajudSchema = z.looseObject({
  took: z.number().nullish(),
  timed_out: z.boolean().nullish(),
  hits: z.looseObject({
    total: z
      .union([
        z.looseObject({ value: z.number(), relation: z.string().nullish() }),
        z.number().transform((value) => ({ value, relation: "eq" })),
      ])
      .nullish(),
    hits: z.array(HitDatajudSchema),
  }),
});

export type ComplementoTabelado = z.infer<typeof ComplementoTabeladoSchema>;
export type MovimentoDatajud = z.infer<typeof MovimentoDatajudSchema>;
export type ProcessoDatajudSource = z.infer<typeof ProcessoDatajudSourceSchema>;
export type HitDatajud = z.infer<typeof HitDatajudSchema>;
export type RespostaDatajud = z.infer<typeof RespostaDatajudSchema>;

/** Movimento já normalizado. */
export interface MovimentoNormalizado {
  codigo: number | null;
  nome: string | null;
  /** ISO 8601 ou null quando a data não pôde ser interpretada. */
  data_hora: string | null;
  complementos: Array<{ codigo: number | null; nome: string | null; valor: number | null; descricao: string | null }>;
}

/** Competência deduzida do DataJud (subconjunto de public.competencia; 'outra' é só escolha manual). */
export type CompetenciaDeduzida = "vara_comum" | "juizado_especial" | "segundo_grau";

/** Processo do DataJud no formato interno (um registro por grau). */
export interface ProcessoDatajud {
  numero_cnj: string;
  tribunal: string | null;
  grau: string | null;
  classe_codigo: number | null;
  classe_nome: string | null;
  assuntos: Array<{ codigo: number | null; nome: string | null }>;
  sistema: string | null;
  formato: string | null;
  /** YYYY-MM-DD. */
  data_ajuizamento: string | null;
  /** ISO 8601. */
  ultima_atualizacao: string | null;
  nivel_sigilo: number;
  /** `nivel_sigilo > 0`. Processos realmente sigilosos costumam nem aparecer na base pública. */
  sigiloso: boolean;
  orgao_julgador_codigo: number | null;
  orgao_julgador_nome: string | null;
  codigo_municipio_ibge: number | null;
  /** Nome da comarca/município-sede, quando o código IBGE é conhecido. */
  comarca: string | null;
  /** Deduzida do grau, do órgão julgador e da classe (`deduzirCompetencia`). */
  competencia: CompetenciaDeduzida;
  /** Ordenados por data decrescente (mais recente primeiro). */
  movimentos: MovimentoNormalizado[];
  ultimo_movimento: MovimentoNormalizado | null;
  payload_bruto: ProcessoDatajudSource;
}
