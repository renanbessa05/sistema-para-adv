import type { ResumoUsuario } from "./agregar";

/** CSV para o Excel em português: BOM UTF-8, separador ";", decimal com vírgula, quebra CRLF. */

const PERIGOSOS = ["=", "+", "-", "@", "\t", "\r"];

/** Célula segura: texto que começa com fórmula ganha apóstrofo; aspas são duplicadas. */
export function celulaCsv(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") return formatarNumero(valor);
  const seguro = PERIGOSOS.some((c) => valor.startsWith(c)) ? `'${valor}` : valor;
  return `"${seguro.replace(/"/g, '""')}"`;
}

function formatarNumero(n: number): string {
  if (!Number.isFinite(n)) return "";
  return Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
}

export function gerarCsv(cabecalho: string[], linhas: (string | number | null | undefined)[][]): string {
  const todas = [cabecalho, ...linhas].map((l) => l.map(celulaCsv).join(";"));
  return "﻿" + todas.join("\r\n") + "\r\n";
}

/** CSV de produtividade do mês: uma linha por pessoa, com totais de prazos e taxa de cumprimento. */
export function csvProdutividade(resumo: ResumoUsuario[]): string {
  const linhas = resumo.map((r) => [
    r.nome,
    r.tarefasConcluidas,
    r.prazosConfirmados,
    r.prazosCumpridos,
    r.prazosVencidos,
    r.taxaCumprimento === null ? null : Math.round(r.taxaCumprimento * 1000) / 10,
    r.publicacoesTratadas,
    r.aprovacoesDecididas,
    r.tempoRevisaoMedioS,
  ]);
  return gerarCsv(
    ["pessoa", "tarefas_concluidas", "prazos_confirmados", "prazos_cumpridos", "prazos_vencidos", "taxa_cumprimento_percentual", "publicacoes_tratadas", "aprovacoes_decididas", "tempo_revisao_medio_s"],
    linhas,
  );
}
