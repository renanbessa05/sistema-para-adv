import type { ItemTabelaOab } from "./tabela-oab-mt";

/** Tabela vigente como vem de ref.tabelas_honorarios + itens (ou da constante, nos testes). */
export interface TabelaHonorarios {
  id: string | null;
  uf: string;
  vigenciaInicio: string; // YYYY-MM-DD
  valorUrh: number;
  itens: ItemTabelaOab[];
}

export const MESES_VALIDADE_TABELA = 12;

/** Regra da skill: tabela com mais de 12 meses da vigência não calcula. */
export function tabelaVencida(vigenciaInicio: string, hoje: string): boolean {
  const [ano, mes, dia] = vigenciaInicio.split("-").map(Number);
  const limite = new Date(Date.UTC(ano, mes - 1 + MESES_VALIDADE_TABELA, dia));
  const [ha, hm, hd] = hoje.split("-").map(Number);
  const dataHoje = new Date(Date.UTC(ha, hm - 1, hd));
  return dataHoje > limite;
}

export function arredondarReais(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function formatarReais(valor: number): string {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function urhParaReais(urh: number, valorUrh: number): number {
  return arredondarReais(urh * valorUrh);
}
