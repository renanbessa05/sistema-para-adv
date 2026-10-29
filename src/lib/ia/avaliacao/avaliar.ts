import { avaliarRubrica, type ResultadoRubrica } from "./rubricas";
import type { Caso } from "./casos";
import type { OpcoesRubrica } from "./rubricas";

/**
 * Avaliação de um caso e resumo da rodada (lote 10). Puro: a saída chega pronta (do modelo ou do caso falso).
 * Um caso "bate" quando o resultado (aprovado/reprovado) é igual ao `esperado`. A rodada é aprovada quando
 * todos os casos batem.
 */

export interface ResultadoCaso {
  id: string;
  esperado: "aprovado" | "reprovado";
  resultado: "aprovado" | "reprovado";
  ok: boolean;
  rubricas: ResultadoRubrica[];
  erro: string | null;
}

export function avaliarCaso(caso: Caso, saida: unknown, opcoes: OpcoesRubrica & { erro?: string | null }): ResultadoCaso {
  const erro = opcoes.erro ?? null;
  const rubricas = erro ? [] : caso.rubricas.map((r) => avaliarRubrica(r, saida, opcoes));
  const aprovado = erro === null && rubricas.every((r) => r.ok);
  const resultado = aprovado ? "aprovado" : "reprovado";
  return { id: caso.id, esperado: caso.esperado, resultado, ok: resultado === caso.esperado, rubricas, erro };
}

export interface ResumoAvaliacao {
  total: number;
  casosOk: number;
  situacao: "aprovada" | "reprovada";
}

export function resumirAvaliacao(resultados: ResultadoCaso[]): ResumoAvaliacao {
  const casosOk = resultados.filter((r) => r.ok).length;
  return { total: resultados.length, casosOk, situacao: casosOk === resultados.length && resultados.length > 0 ? "aprovada" : "reprovada" };
}
