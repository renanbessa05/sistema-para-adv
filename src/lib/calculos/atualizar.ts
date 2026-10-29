/**
 * Atualização monetária e juros (puro, sem banco). Convenções, para conferência com a advogada:
 * - Correção: fator acumulado com as variações mensais (%) do índice, do mês seguinte ao da data inicial até o mês
 *   da data final, inclusive. Mês sem índice publicado é erro: o cálculo não chuta.
 * - Juros simples: taxa mensal × dias / 30 (mês comercial de 30 dias), sobre o valor corrigido.
 * - Juros pela SELIC (Fazenda, EC 113/2021): soma simples das taxas mensais do período, sobre o valor.
 * - Arredondamento só no resultado final de cada item (centavos, meio para cima).
 */

export type Serie = Record<string, number>; // "YYYY-MM" -> variação mensal em %

export interface RegraCalculo {
  codigo: string;
  correcao: "inpc" | "ipca" | "ipca_e" | "igpm" | "informada" | null;
  jurosTaxaMensal: number | null;
  jurosSelic: boolean;
  jurosSelicMenosIpca: boolean;
}

export interface ItemCalculo {
  descricao: string;
  dataInicial: string; // YYYY-MM-DD
  valorOriginal: number;
}

export interface PassoCalculo {
  etapa: "correcao" | "juros";
  texto: string;
}

export interface ResultadoItem {
  descricao: string;
  valorOriginal: number;
  valorCorrigido: number;
  juros: number;
  total: number;
  passos: PassoCalculo[];
}

export interface SeriesEntrada {
  inpc?: Serie;
  ipca?: Serie;
  ipca_e?: Serie;
  igpm?: Serie;
  selic?: Serie;
}

export class ErroCalculo extends Error {}

export function mesDe(data: string): string {
  return data.slice(0, 7);
}

/** Meses entre duas competências "YYYY-MM" (b depois de a). */
export function mesesDeCompetencia(de: string, ate: string): string[] {
  const [a, ma] = de.split("-").map(Number);
  const [b, mb] = ate.split("-").map(Number);
  const saida: string[] = [];
  let ano = a;
  let mes = ma;
  while (ano * 12 + mes < b * 12 + mb) {
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
    saida.push(`${ano}-${String(mes).padStart(2, "0")}`);
  }
  return saida;
}

export function diasEntre(de: string, ate: string): number {
  const a = Date.UTC(...(de.split("-").map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))) as [number, number, number]));
  const b = Date.UTC(...(ate.split("-").map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))) as [number, number, number]));
  if (b < a) throw new ErroCalculo(`Data final (${ate}) anterior à inicial (${de})`);
  return Math.round((b - a) / 86_400_000);
}

export function fatorCorrecao(serie: Serie, dataInicial: string, dataFinal: string): { fator: number; meses: string[] } {
  const meses = mesesDeCompetencia(mesDe(dataInicial), mesDe(dataFinal));
  let fator = 1;
  for (const m of meses) {
    const v = serie[m];
    if (v === undefined || !Number.isFinite(v)) throw new ErroCalculo(`Índice sem valor publicado para ${m}`);
    fator *= 1 + v / 100;
  }
  return { fator, meses };
}

export function somaSelic(serie: Serie, dataInicial: string, dataFinal: string): { taxa: number; meses: string[] } {
  const meses = mesesDeCompetencia(mesDe(dataInicial), mesDe(dataFinal));
  let taxa = 0;
  for (const m of meses) {
    const v = serie[m];
    if (v === undefined || !Number.isFinite(v)) throw new ErroCalculo(`SELIC sem valor publicado para ${m}`);
    taxa += v;
  }
  return { taxa, meses };
}

export function arredondar(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

const NOME_INDICE: Record<string, string> = { inpc: "INPC", ipca: "IPCA", ipca_e: "IPCA-E", igpm: "IGP-M", selic: "SELIC" };

export function atualizarItem(item: ItemCalculo, regra: RegraCalculo, series: SeriesEntrada, dataFinal: string): ResultadoItem {
  const passos: PassoCalculo[] = [];
  let valorCorrigido = item.valorOriginal;

  if (regra.correcao && regra.correcao !== "informada") {
    const serie = series[regra.correcao];
    if (!serie) throw new ErroCalculo(`Série do ${NOME_INDICE[regra.correcao]} não carregada`);
    const { fator, meses } = fatorCorrecao(serie, item.dataInicial, dataFinal);
    valorCorrigido = item.valorOriginal * fator;
    passos.push({ etapa: "correcao", texto: `${NOME_INDICE[regra.correcao]} de ${meses.length} mês(es) (${meses[0] ?? "—"} a ${meses[meses.length - 1] ?? "—"}): fator ${fator.toFixed(6)}` });
  }

  let jurosTaxa = 0;
  let juros = 0;
  const dias = diasEntre(item.dataInicial, dataFinal);
  if (regra.jurosSelic) {
    const serie = series.selic;
    if (!serie) throw new ErroCalculo("Série da SELIC não carregada");
    const { taxa, meses } = somaSelic(serie, item.dataInicial, dataFinal);
    juros = valorCorrigido * (taxa / 100);
    passos.push({ etapa: "juros", texto: `SELIC acumulada de ${meses.length} mês(es): ${taxa.toFixed(4)}%` });
  } else if (regra.jurosSelicMenosIpca) {
    const selic = series.selic;
    const ipca = series.ipca;
    if (!selic || !ipca) throw new ErroCalculo("Séries da SELIC e do IPCA são necessárias");
    const s = somaSelic(selic, item.dataInicial, dataFinal).taxa;
    const i = somaSelic(ipca, item.dataInicial, dataFinal).taxa;
    jurosTaxa = Math.max(0, s - i);
    juros = valorCorrigido * (jurosTaxa / 100);
    passos.push({ etapa: "juros", texto: `SELIC (${s.toFixed(4)}%) menos IPCA (${i.toFixed(4)}%), piso zero: ${jurosTaxa.toFixed(4)}%` });
  } else if (regra.jurosTaxaMensal !== null) {
    jurosTaxa = regra.jurosTaxaMensal;
    juros = valorCorrigido * (jurosTaxa / 100) * (dias / 30);
    passos.push({ etapa: "juros", texto: `${jurosTaxa}% ao mês por ${dias} dia(s) (${(dias / 30).toFixed(4)} mês comercial)` });
  }

  const total = arredondar(valorCorrigido + juros);
  return {
    descricao: item.descricao,
    valorOriginal: arredondar(item.valorOriginal),
    valorCorrigido: arredondar(valorCorrigido),
    juros: arredondar(juros),
    total,
    passos,
  };
}

export function atualizarDivida(itens: ItemCalculo[], regra: RegraCalculo, series: SeriesEntrada, dataFinal: string) {
  const resultados = itens.map((i) => atualizarItem(i, regra, series, dataFinal));
  const soma = (k: "valorOriginal" | "valorCorrigido" | "juros" | "total") => arredondar(resultados.reduce((s, r) => s + r[k], 0));
  return {
    itens: resultados,
    totais: { valorOriginal: soma("valorOriginal"), valorCorrigido: soma("valorCorrigido"), juros: soma("juros"), total: soma("total") },
    dataFinal,
  };
}
