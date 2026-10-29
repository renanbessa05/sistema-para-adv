/**
 * Alerta de rotina sem execução recente (/admin/status e /status). Puro: recebe a última execução de cada rotina.
 */

const HORA = 60 * 60 * 1000;

/**
 * Limite em horas sem execução antes do alerta. Padrão 24 h (rotinas diárias).
 * Rotinas só de dias úteis ficam 96 h (sexta à terça), para não alertar no fim de semana.
 * verificar-backup roda às segundas: 8 dias.
 */
const LIMITE_POR_ROTINA: Record<string, number> = {
  "verificar-backup": 8 * 24,
  "captar-djen": 96,
  classificar: 96,
  "alertas-publicacao": 96,
  "alertas-prazo": 96,
  "resumo-do-dia": 96,
  "exportar-prazos": 96,
  "captacao-vigilante": 96,
  "cobranca-parcelas": 96,
};

export const LIMITE_PADRAO_HORAS = 24;

export function limiteHorasRotina(rotina: string): number {
  return LIMITE_POR_ROTINA[rotina] ?? LIMITE_PADRAO_HORAS;
}

export interface UltimaExecucaoRotina {
  rotina: string;
  ultimoInicio: Date | null;
}

export interface AlertaRotina {
  rotina: string;
  motivo: "nunca_executou" | "atrasada";
  horasSemExecucao: number | null;
  limiteHoras: number;
}

/** Devolve as rotinas que passaram do limite sem execução. */
export function avaliarRotinas(ultimas: UltimaExecucaoRotina[], agora: Date): AlertaRotina[] {
  const alertas: AlertaRotina[] = [];
  for (const u of ultimas) {
    const limiteHoras = limiteHorasRotina(u.rotina);
    if (!u.ultimoInicio) {
      alertas.push({ rotina: u.rotina, motivo: "nunca_executou", horasSemExecucao: null, limiteHoras });
      continue;
    }
    const horas = (agora.getTime() - u.ultimoInicio.getTime()) / HORA;
    if (horas > limiteHoras) {
      alertas.push({ rotina: u.rotina, motivo: "atrasada", horasSemExecucao: Math.floor(horas), limiteHoras });
    }
  }
  return alertas;
}

/** Rotinas que aparecem em /admin/status e /status (o nome é o de jobs_execucoes.job). */
export const ROTINAS_MONITORADAS = [
  "captar-djen",
  "classificar",
  "enriquecer-datajud",
  "drenar-notificacoes",
  "alertas-publicacao",
  "alertas-prazo",
  "resumo-do-dia",
  "marcar-vencidos",
  "exportar-prazos",
  "atualizar-metricas",
  "captacao-vigilante",
  "enviar-mensagens-cliente",
  "cobranca-parcelas",
  "backup-tenant",
  "verificar-backup",
] as const;
