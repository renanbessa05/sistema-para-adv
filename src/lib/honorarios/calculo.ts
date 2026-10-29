import { arredondarReais, tabelaVencida, urhParaReais, type TabelaHonorarios } from "./tabela";

/**
 * Cálculo de honorários em três camadas (skill contratacao-e-honorarios, Etapa 2), todo determinístico:
 * 1. piso da OAB/MT: soma dos mínimos das rubricas, em URH e em reais (+50% na cautelar satisfativa);
 * 2. percentual sobre o proveito econômico (maior percentual entre as rubricas);
 * 3. sugerido: o maior entre (1) e (2), ajustado pelo fator de complexidade.
 * Regras invioláveis: nunca abaixo do piso; contratual + sucumbência ≤ proveito (art. 50 do CED); acima de 30%
 * do proveito é zona de risco de revisional; tabela com mais de 12 meses bloqueia.
 */

export type Complexidade = "baixa" | "media" | "alta";
export type Modalidade = "fixo" | "exito" | "misto" | "fixo_parcelado";

export interface FatoresComplexidade {
  baixa: number;
  media: number;
  alta: number;
}

/** Padrão a calibrar com a advogada (a skill exige o fator, mas não o define). */
export const FATORES_PADRAO: FatoresComplexidade = { baixa: 1.0, media: 1.3, alta: 1.6 };

export interface EntradaHonorarios {
  rubricas: string[];
  proveitoEconomico: number | null;
  complexidade: Complexidade;
  cautelarSatisfativa?: boolean;
  fatores?: Partial<FatoresComplexidade>;
  /** Para a modalidade parcelada: número de parcelas desejado (senão sugerido). */
  parcelas?: number | null;
  hoje: string;
}

export type AlertaHonorarios = "tabela_vencida" | "rubrica_desconhecida" | "proveito_desconhecido" | "acima_30" | "perto_teto_art50" | "cautelar_satisfativa" | "abaixo_piso";

export interface RubricaCalculada {
  codigo: string;
  secao: string;
  item: string;
  urh: number;
  reais: number;
  percentual: number | null;
}

export interface ModalidadeCalculada {
  tipo: Modalidade;
  rotulo: string;
  /** Valor fixo (fixo, parcelado, entrada do misto). */
  valorFixo: number | null;
  /** Percentual de êxito (êxito, misto). */
  percentual: number | null;
  parcelas: number | null;
  valorParcela: number | null;
  /** Estimativa do total em reais, dado o proveito informado. */
  estimativaTotal: number | null;
  disponivel: boolean;
  observacao: string | null;
}

export interface ResultadoHonorarios {
  bloqueio: "tabela_vencida" | "sem_rubrica" | null;
  valorUrh: number;
  vigenciaInicio: string;
  rubricas: RubricaCalculada[];
  piso: { urh: number; reais: number };
  percentual: { taxa: number; base: number; reais: number } | null;
  fator: number;
  /** Maior entre piso e percentual, antes do fator. */
  base: number;
  sugerido: number;
  tetoArt50: number | null;
  modalidades: ModalidadeCalculada[];
  alertas: AlertaHonorarios[];
}

export const ROTULO_MODALIDADE: Record<Modalidade, string> = { fixo: "Valor fixo", exito: "Êxito puro (quota litis)", misto: "Misto (entrada + êxito)", fixo_parcelado: "Fixo parcelado" };

export function calcularHonorarios(entrada: EntradaHonorarios, tabela: TabelaHonorarios): ResultadoHonorarios {
  const fatores = { ...FATORES_PADRAO, ...(entrada.fatores ?? {}) };
  const alertas: AlertaHonorarios[] = [];
  const vazio: ResultadoHonorarios = { bloqueio: null, valorUrh: tabela.valorUrh, vigenciaInicio: tabela.vigenciaInicio, rubricas: [], piso: { urh: 0, reais: 0 }, percentual: null, fator: fatores[entrada.complexidade], base: 0, sugerido: 0, tetoArt50: entrada.proveitoEconomico, modalidades: [], alertas };

  if (tabelaVencida(tabela.vigenciaInicio, entrada.hoje)) {
    alertas.push("tabela_vencida");
    return { ...vazio, bloqueio: "tabela_vencida" };
  }

  const rubricas: RubricaCalculada[] = [];
  for (const codigo of entrada.rubricas) {
    const item = tabela.itens.find((i) => i.codigo === codigo);
    if (!item) {
      alertas.push("rubrica_desconhecida");
      continue;
    }
    let urh = item.multiploUrh ?? item.minimoUrh ?? 0;
    if (entrada.cautelarSatisfativa && item.secao === "VIII") {
      urh = urh * 1.5;
      if (!alertas.includes("cautelar_satisfativa")) alertas.push("cautelar_satisfativa");
    }
    rubricas.push({ codigo, secao: item.secao, item: item.item, urh, reais: urhParaReais(urh, tabela.valorUrh), percentual: item.percentual });
  }
  if (rubricas.length === 0) return { ...vazio, bloqueio: "sem_rubrica" };

  const pisoUrh = rubricas.reduce((s, r) => s + r.urh, 0);
  const piso = { urh: pisoUrh, reais: urhParaReais(pisoUrh, tabela.valorUrh) };

  const taxas = rubricas.map((r) => r.percentual).filter((p): p is number => p !== null);
  const taxa = taxas.length ? Math.max(...taxas) : null;
  const proveito = entrada.proveitoEconomico !== null && entrada.proveitoEconomico > 0 ? entrada.proveitoEconomico : null;
  if (!proveito) alertas.push("proveito_desconhecido");
  const percentual = taxa !== null && proveito ? { taxa, base: proveito, reais: arredondarReais((proveito * taxa) / 100) } : null;

  const base = Math.max(piso.reais, percentual?.reais ?? 0);
  const fator = fatores[entrada.complexidade];
  const sugerido = arredondarReais(base * fator);

  // Percentual de êxito proposto: a taxa da rubrica (20%, 5%, 30%...) ou 20% por padrão
  const taxaExito = taxa ?? 20;
  if (taxaExito > 30) alertas.push("acima_30");
  if (taxaExito >= 45) alertas.push("perto_teto_art50");

  const parcelasSugeridas = entrada.parcelas && entrada.parcelas > 0 ? Math.floor(entrada.parcelas) : sugeridoParcelas(sugerido, tabela.valorUrh);
  const entradaMisto = arredondarReais(Math.max(piso.reais, sugerido * 0.4));
  const taxaMisto = Math.max(10, Math.round(taxaExito * 0.75));

  const modalidades: ModalidadeCalculada[] = [
    { tipo: "fixo", rotulo: ROTULO_MODALIDADE.fixo, valorFixo: sugerido, percentual: null, parcelas: null, valorParcela: null, estimativaTotal: sugerido, disponivel: true, observacao: "Devido independentemente do resultado." },
    {
      tipo: "exito",
      rotulo: ROTULO_MODALIDADE.exito,
      valorFixo: null,
      percentual: taxaExito,
      parcelas: null,
      valorParcela: null,
      estimativaTotal: proveito ? arredondarReais((proveito * taxaExito) / 100) : null,
      disponivel: Boolean(proveito),
      observacao: proveito ? "Nada entra até o cliente receber. Sujeito ao teto do art. 50 do CED." : "Indisponível sem proveito econômico apurável.",
    },
    {
      tipo: "misto",
      rotulo: ROTULO_MODALIDADE.misto,
      valorFixo: entradaMisto,
      percentual: taxaMisto,
      parcelas: null,
      valorParcela: null,
      estimativaTotal: proveito ? arredondarReais(entradaMisto + (proveito * taxaMisto) / 100) : null,
      disponivel: Boolean(proveito),
      observacao: proveito ? "Entrada cobre o custo do trabalho; êxito reduzido mantém o alinhamento." : "Indisponível sem proveito econômico apurável.",
    },
    {
      tipo: "fixo_parcelado",
      rotulo: ROTULO_MODALIDADE.fixo_parcelado,
      valorFixo: sugerido,
      percentual: null,
      parcelas: parcelasSugeridas,
      valorParcela: arredondarReais(sugerido / parcelasSugeridas),
      estimativaTotal: sugerido,
      disponivel: true,
      observacao: "Primeira parcela antes do protocolo; inadimplemento vence o saldo com multa de 10%, juros de 1% a.m. e correção.",
    },
  ];

  return { bloqueio: null, valorUrh: tabela.valorUrh, vigenciaInicio: tabela.vigenciaInicio, rubricas, piso, percentual, fator, base, sugerido, tetoArt50: proveito, modalidades, alertas };
}

/** Parcelamento sugerido: até 12 parcelas de cerca de 1,5 URH cada, a partir de 3 URH. */
export function sugeridoParcelas(valor: number, valorUrh: number): number {
  if (valor <= 3 * valorUrh) return 1;
  return Math.max(2, Math.min(12, Math.ceil(valor / (1.5 * valorUrh))));
}

/**
 * Valida o valor confirmado pela advogada contra o cálculo: nunca abaixo do piso (aviltamento), êxito acima de 30%
 * sinaliza revisional, contratual + sucumbência (estimada em 10%) não pode superar o proveito.
 */
export function validarConfirmacao(c: { modalidade: Modalidade; valorFixo: number | null; percentual: number | null }, r: ResultadoHonorarios): { ok: boolean; alertas: AlertaHonorarios[]; erros: string[] } {
  const alertas: AlertaHonorarios[] = [];
  const erros: string[] = [];
  if (r.bloqueio) erros.push(r.bloqueio === "tabela_vencida" ? "Tabela da OAB/MT vencida: cadastre a vigente antes de confirmar." : "Nenhuma rubrica aplicável.");
  if (c.modalidade === "fixo" || c.modalidade === "fixo_parcelado" || c.modalidade === "misto") {
    if (c.valorFixo === null || c.valorFixo <= 0) erros.push("Informe o valor fixo.");
    else if (c.modalidade !== "misto" && c.valorFixo < r.piso.reais) {
      alertas.push("abaixo_piso");
      erros.push(`Valor abaixo do piso da OAB/MT (${r.piso.urh} URH). Cobrar abaixo da tabela é aviltamento.`);
    }
  }
  if (c.modalidade === "exito" || c.modalidade === "misto") {
    if (c.percentual === null || c.percentual <= 0) erros.push("Informe o percentual de êxito.");
    else {
      if (c.percentual > 30) alertas.push("acima_30");
      if (c.percentual + 10 > 100) alertas.push("perto_teto_art50");
      if (r.tetoArt50 && c.modalidade === "exito" && (r.tetoArt50 * c.percentual) / 100 < r.piso.reais) {
        alertas.push("abaixo_piso");
      }
    }
  }
  return { ok: erros.length === 0, alertas, erros };
}
