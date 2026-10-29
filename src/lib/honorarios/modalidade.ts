import type { Modalidade } from "./calculo";

/**
 * Matriz de decisão da forma de cobrança (references/decisao-modalidade.md). Determinística: a advogada calibra
 * os pesos. Nunca escolhe sozinha: devolve a recomendação e a razão em duas linhas.
 */
export interface DiagnosticoParaModalidade {
  proveito: "alto" | "medio" | "baixo" | "inestimavel";
  tese: "solida" | "incerta" | "desconhecida";
  liquidezCliente: "sem_liquidez" | "fluxo_sem_caixa" | "com_caixa" | "desconhecida";
  trabalho: "pontual" | "medio" | "longo";
  clienteNovo: boolean;
  tituloFormado: boolean;
  pessoaJuridicaRecorrente?: boolean;
}

export interface SugestaoModalidade {
  modalidade: Modalidade;
  razao: string;
  parcelamentoSugerido: boolean;
}

export function sugerirModalidade(d: DiagnosticoParaModalidade): SugestaoModalidade {
  if (d.tituloFormado && (d.liquidezCliente === "sem_liquidez" || d.liquidezCliente === "desconhecida") && d.proveito !== "inestimavel") {
    return { modalidade: "exito", razao: "Título já formado e cliente sem liquidez: risco baixo, proveito apurável. Padrão do escritório: 30% sobre o líquido.", parcelamentoSugerido: false };
  }
  if (d.proveito === "inestimavel" || d.trabalho === "pontual") {
    const parcelado = d.liquidezCliente === "fluxo_sem_caixa";
    return { modalidade: parcelado ? "fixo_parcelado" : "fixo", razao: d.trabalho === "pontual" ? "Trabalho pontual: cobra-se o múltiplo em URH da rubrica, à vista." : "Proveito inestimável ou não pecuniário: não há sobre o que aplicar percentual; cobra-se o múltiplo em URH ajustado pela complexidade.", parcelamentoSugerido: parcelado };
  }
  if (d.tese === "incerta" && d.trabalho === "longo") {
    return { modalidade: "misto", razao: "Tese incerta e trabalho longo: êxito puro seria o pior dos dois mundos. Entrada maior custeia o esforço; êxito reduzido mantém o alinhamento.", parcelamentoSugerido: false };
  }
  if (d.proveito === "alto") {
    return { modalidade: "misto", razao: "Proveito alto com risco médio: a entrada cobre perícia e instrução; o êxito reduzido (15% a 20%) mantém o alinhamento.", parcelamentoSugerido: false };
  }
  if (d.liquidezCliente === "sem_liquidez" && d.tese === "solida") {
    return { modalidade: "exito", razao: "Tese sólida e cliente sem liquidez: o êxito remunera sem exigir caixa agora.", parcelamentoSugerido: false };
  }
  if (d.liquidezCliente === "fluxo_sem_caixa") {
    return { modalidade: "fixo_parcelado", razao: "Cliente com fluxo mas sem caixa: valor certo dividido em parcelas, com a primeira antes do protocolo.", parcelamentoSugerido: true };
  }
  if (d.clienteNovo) {
    return { modalidade: "misto", razao: "Cliente novo, sem histórico: entrada ainda que simbólica, com cláusula de proporcionalidade, e êxito pelo resultado.", parcelamentoSugerido: false };
  }
  return { modalidade: "fixo", razao: "Proveito médio, tese conhecida e cliente com caixa: valor fixo dá previsibilidade e risco zero de trabalho não remunerado.", parcelamentoSugerido: false };
}
