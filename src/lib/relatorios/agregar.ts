/** Produtividade por usuário e por mês. Puro: recebe as linhas da RPC metricas_usuarios_do_escritorio. */

export interface LinhaProdutividade {
  usuarioId: string;
  nome: string;
  /** Primeiro dia do mês, YYYY-MM-DD. */
  competencia: string;
  tarefasConcluidas: number;
  prazosConfirmados: number;
  prazosCumpridos: number;
  prazosVencidos: number;
  publicacoesTratadas: number;
  aprovacoesDecididas: number;
  tempoRevisaoTotalS: number;
}

export interface ResumoUsuario {
  usuarioId: string;
  nome: string;
  tarefasConcluidas: number;
  prazosConfirmados: number;
  prazosCumpridos: number;
  prazosVencidos: number;
  publicacoesTratadas: number;
  aprovacoesDecididas: number;
  /** Média em segundos da revisão humana; null sem aprovações decididas. */
  tempoRevisaoMedioS: number | null;
  /** cumpridos / (cumpridos + vencidos), 0 a 1; null sem prazos. Definição a confirmar com a advogada. */
  taxaCumprimento: number | null;
}

/** Converte um registro da RPC (snake_case, números podem vir como texto) em linha tipada. */
export function linhaDeRpc(r: Record<string, unknown>): LinhaProdutividade {
  return {
    usuarioId: String(r.usuario_id),
    nome: String(r.nome_completo ?? "(sem nome)"),
    competencia: String(r.competencia),
    tarefasConcluidas: numero(r.tarefas_concluidas),
    prazosConfirmados: numero(r.prazos_confirmados),
    prazosCumpridos: numero(r.prazos_cumpridos),
    prazosVencidos: numero(r.prazos_vencidos),
    publicacoesTratadas: numero(r.publicacoes_tratadas),
    aprovacoesDecididas: numero(r.aprovacoes_decididas),
    tempoRevisaoTotalS: numero(r.tempo_revisao_total_s),
  };
}

function numero(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** cumpridos / (cumpridos + vencidos), arredondado a 4 casas; null quando não há prazos. */
export function taxaCumprimento(cumpridos: number, vencidos: number): number | null {
  const total = cumpridos + vencidos;
  if (total <= 0) return null;
  return Math.round((cumpridos / total) * 10000) / 10000;
}

/** Média de revisão em segundos, arredondada a 1 casa; null sem decisões. */
export function tempoMedioRevisao(totalS: number, decisoes: number): number | null {
  if (decisoes <= 0) return null;
  return Math.round((totalS / decisoes) * 10) / 10;
}

/** Soma os meses de cada pessoa e calcula as médias. Ordena por nome (pt-BR). */
export function resumirPorUsuario(linhas: LinhaProdutividade[]): ResumoUsuario[] {
  const porUsuario = new Map<string, { nome: string; acumulado: Omit<ResumoUsuario, "usuarioId" | "nome" | "tempoRevisaoMedioS" | "taxaCumprimento"> & { tempo: number } }>();
  for (const l of linhas) {
    const atual = porUsuario.get(l.usuarioId) ?? {
      nome: l.nome,
      acumulado: { tarefasConcluidas: 0, prazosConfirmados: 0, prazosCumpridos: 0, prazosVencidos: 0, publicacoesTratadas: 0, aprovacoesDecididas: 0, tempo: 0 },
    };
    const a = atual.acumulado;
    a.tarefasConcluidas += l.tarefasConcluidas;
    a.prazosConfirmados += l.prazosConfirmados;
    a.prazosCumpridos += l.prazosCumpridos;
    a.prazosVencidos += l.prazosVencidos;
    a.publicacoesTratadas += l.publicacoesTratadas;
    a.aprovacoesDecididas += l.aprovacoesDecididas;
    a.tempo += l.tempoRevisaoTotalS;
    porUsuario.set(l.usuarioId, atual);
  }
  const resumo: ResumoUsuario[] = [...porUsuario.entries()].map(([usuarioId, { nome, acumulado: a }]) => ({
    usuarioId,
    nome,
    tarefasConcluidas: a.tarefasConcluidas,
    prazosConfirmados: a.prazosConfirmados,
    prazosCumpridos: a.prazosCumpridos,
    prazosVencidos: a.prazosVencidos,
    publicacoesTratadas: a.publicacoesTratadas,
    aprovacoesDecididas: a.aprovacoesDecididas,
    tempoRevisaoMedioS: tempoMedioRevisao(a.tempo, a.aprovacoesDecididas),
    taxaCumprimento: taxaCumprimento(a.prazosCumpridos, a.prazosVencidos),
  }));
  return resumo.sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));
}

/** Totais do período (todas as pessoas). */
export function totaisDoPeriodo(resumo: ResumoUsuario[]) {
  const soma = (campo: "tarefasConcluidas" | "prazosConfirmados" | "prazosCumpridos" | "prazosVencidos" | "publicacoesTratadas" | "aprovacoesDecididas") =>
    resumo.reduce((s, r) => s + r[campo], 0);
  const cumpridos = soma("prazosCumpridos");
  const vencidos = soma("prazosVencidos");
  return {
    tarefasConcluidas: soma("tarefasConcluidas"),
    prazosConfirmados: soma("prazosConfirmados"),
    prazosCumpridos: cumpridos,
    prazosVencidos: vencidos,
    publicacoesTratadas: soma("publicacoesTratadas"),
    aprovacoesDecididas: soma("aprovacoesDecididas"),
    taxaCumprimento: taxaCumprimento(cumpridos, vencidos),
  };
}

const COMPETENCIA = /^(\d{4})-(\d{2})$/;

/** "2026-10" -> true quando é ano-mês válido. */
export function competenciaValida(texto: string): boolean {
  const m = COMPETENCIA.exec(texto);
  if (!m) return false;
  const mes = Number(m[2]);
  return mes >= 1 && mes <= 12;
}

/** Primeiro dia do mês de uma data YYYY-MM-DD, em formato YYYY-MM-DD. */
export function primeiroDiaDoMes(dataIso: string): string {
  return `${dataIso.slice(0, 7)}-01`;
}

/** Primeiro dia do mês anterior ao da data YYYY-MM-DD. */
export function mesAnterior(dataIso: string): string {
  const ano = Number(dataIso.slice(0, 4));
  const mes = Number(dataIso.slice(5, 7));
  const anterior = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  return `${anterior.ano}-${String(anterior.mes).padStart(2, "0")}-01`;
}

/** Rótulo do mês em pt-BR, ex.: "outubro de 2026". */
export function rotuloMes(competencia: string): string {
  const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const mes = Number(competencia.slice(5, 7));
  return `${nomes[mes - 1]} de ${competencia.slice(0, 4)}`;
}
