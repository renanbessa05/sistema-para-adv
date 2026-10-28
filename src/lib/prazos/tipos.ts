/** Data no formato YYYY-MM-DD, sem hora e sem fuso. É o único formato de data do motor. */
export type DataISO = string;

export type Abrangencia = "nacional" | "estadual" | "municipal" | "forense" | "recesso" | "suspensao_ad_hoc";

/** Linha de `ref.feriados` (ou equivalente) já filtrada para um tribunal. */
export interface DiaSemExpediente {
  data: DataISO;
  descricao: string;
  abrangencia: Abrangencia;
  /** Preenchido só para feriados municipais: suspende prazo apenas nessa comarca. */
  comarcaId?: string | null;
  /** Pontos facultativos e feriados suspendem prazo no TJ-MT; dias de expediente reduzido podem não suspender. */
  suspendePrazo: boolean;
  atoNormativo?: string | null;
}

export interface Calendario {
  tribunal: string;
  comarcaId: string | null;
  /** Anos para os quais o calendário foi carregado (feriados forenses conferidos). */
  anosCobertos: number[];
  /** Dias sem expediente aplicáveis (municipais já filtrados pela comarca). Chave: data. */
  diasPorData: Map<DataISO, DiaSemExpediente[]>;
}

export type Contagem = "dias_uteis" | "dias_corridos" | "horas";
export type TipoPrazo = "processual" | "material" | "interno";

export interface Ato {
  descricao: string;
  quantidade: number;
  contagem: Contagem;
  /** 1 (padrão) ou 2 (prazo em dobro: Fazenda, MP, Defensoria). */
  multiplicador?: 1 | 2;
  fundamentoDobro?: string | null;
  tipo?: TipoPrazo;
}

export type OrigemIntimacao = "publicacao_djen" | "intimacao_pessoal" | "citacao_eletronica" | "audiencia" | "decisao" | "manual";

export interface EntradaCalculo {
  origem: OrigemIntimacao;
  /** Data em que a comunicação ficou disponível no DJEN (vem da API). */
  dataDisponibilizacao?: DataISO;
  /** Se já se souber a data de publicação (ex.: lançamento manual), pode ser informada direto. */
  dataPublicacao?: DataISO;
  /** Data do dia 1 da contagem, quando conhecida (ex.: ciência pessoal, audiência). Sobrepõe o cálculo do termo inicial. */
  dataInicioContagem?: DataISO;
  ato: Ato;
  calendario: Calendario;
  /** Dias úteis de segurança para a data interna (padrão 2). */
  diasSeguranca?: number;
}

export interface LinhaMemoria {
  data: DataISO;
  /** Número do dia contado (1..n) ou null quando pulado. */
  dia: number | null;
  status: "contado" | "pulado" | "marco";
  motivo: string;
}

export interface ResultadoCalculo {
  dataDisponibilizacao: DataISO | null;
  dataPublicacao: DataISO | null;
  dataInicioContagem: DataISO;
  dataFinal: DataISO;
  /** Data final menos os dias úteis de segurança. */
  dataInterna: DataISO;
  quantidadeEfetiva: number;
  contagem: Contagem;
  diasPulados: { data: DataISO; motivo: string }[];
  avisos: string[];
  /** true quando algum ano percorrido não está em `calendario.anosCobertos` ou faltou comarca para feriado municipal. */
  calendarioIncompleto: boolean;
  memoria: LinhaMemoria[];
}
