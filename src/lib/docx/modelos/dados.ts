import type { Modalidade } from "../../honorarios/calculo";
import type { Timbre } from "../timbre";

/** Qualificação do cliente como aparece nos três documentos (idêntica em todos). */
export interface QualificacaoCliente {
  tipoPessoa: "fisica" | "juridica";
  nome: string;
  nacionalidade: string | null;
  estadoCivil: string | null;
  profissao: string | null;
  cpfCnpj: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  email: string | null;
  telefone: string | null;
  /** Pessoa jurídica: representante legal e qualificação, e o instrumento (contrato social/estatuto). */
  representante: string | null;
  representanteQualificacao: string | null;
  instrumentoRepresentacao: string | null;
}

export interface DadosContrato {
  timbre: Timbre;
  cliente: QualificacaoCliente;
  objeto: {
    /** "propositura e acompanhamento" | "defesa" | "acompanhamento" */
    atuacao: string;
    tipoDemanda: string;
    parteContraria: string | null;
    processoCnj: string | null;
    juizo: string | null;
    pedidos: string[];
    exclusoes: string | null;
  };
  honorarios: {
    modalidade: Modalidade;
    valorFixo: number | null;
    percentual: number | null;
    parcelas: number | null;
    primeiraParcelaEm: string | null; // YYYY-MM-DD
    diaVencimento: number | null;
    urhEquivalente: number | null;
    valorUrh: number | null;
    /** Misto: entrada é abatida do êxito? (padrão não) */
    abaterEntrada: boolean;
    descontosLegais: string | null;
    exclusoesBase: string[];
    reajuste: string;
  };
  gratuidade: boolean;
  comarcaForo: string | null;
  comarcaSede: string | null;
  /** Fato essencial que o cliente declara ter informado (opcional). */
  fatoEssencialDeclarado: string | null;
  /** Como aparece a expedição no destaque: "RPV ou precatório" | "alvará". */
  instrumentoDestaque: string;
  /** Data de assinatura por extenso, ou null para "data da assinatura eletrônica". */
  dataAssinatura: string | null;
}

export interface DadosProcuracao {
  timbre: Timbre;
  cliente: QualificacaoCliente;
  /** Contatos do outorgante: do cliente, do escritório ou nenhum (política antifraude). */
  contatos: "cliente" | "escritorio" | "nenhum";
  orgaosDoCaso: string | null;
  poderesEspecificos: string[];
  dataPorExtenso: string;
}

export interface DadosDeclaracao {
  cliente: QualificacaoCliente;
  comarca: string | null;
  uf: string | null;
}
