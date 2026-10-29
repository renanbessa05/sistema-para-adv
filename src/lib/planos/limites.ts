/**
 * Regras puras de planos, limites e acesso de suporte (docs/regras/planos.md).
 * Sem Next e sem Supabase: quem chama passa os números e as datas.
 */

export type ChaveLimite = "usuarios" | "processos";

export interface ResultadoLimite {
  permitido: boolean;
  /** Quantos ainda cabem; null quando não há limite configurado. */
  restante: number | null;
}

/** null = sem limite configurado (regra da 0048: nenhum plano é semeado por padrão). */
export function avaliarLimite(atual: number, limite: number | null | undefined): ResultadoLimite {
  if (limite === null || limite === undefined) return { permitido: true, restante: null };
  const restante = Math.max(0, limite - atual);
  return { permitido: atual < limite, restante };
}

/**
 * Teto mensal de IA em USD. Ordem: configuração do escritório ('ia.teto_mensal_usd') → override em
 * escritorio_limites.teto_ia_usd → padrão do ambiente. Mesma precedência de sempre; o override só entra
 * quando a configuração do escritório não existe.
 */
export function escolherTeto(entradas: {
  configuracao: number | null | undefined;
  override: number | null | undefined;
  padrao: number;
}): number {
  if (entradas.configuracao !== null && entradas.configuracao !== undefined) return Number(entradas.configuracao);
  if (entradas.override !== null && entradas.override !== undefined) return Number(entradas.override);
  return entradas.padrao;
}

export const DIAS_MAXIMOS_ACESSO_SUPORTE = 30; // proposta técnica, a confirmar pelo escritório (docs/adr/0014)

export function acessoSuporteVigente(acesso: { expiraEm: Date; revogadoEm: Date | null }, agora: Date): boolean {
  return acesso.revogadoEm === null && acesso.expiraEm.getTime() > agora.getTime();
}

/** Mensagem de erro para a validade pedida, ou null quando está no intervalo permitido. */
export function validarValidadeAcesso(expiraEm: Date, agora: Date): string | null {
  if (Number.isNaN(expiraEm.getTime())) return "Informe a validade do acesso.";
  if (expiraEm.getTime() <= agora.getTime()) return "A validade precisa ser depois de agora.";
  const limite = agora.getTime() + DIAS_MAXIMOS_ACESSO_SUPORTE * 24 * 60 * 60 * 1000;
  if (expiraEm.getTime() > limite) return `A validade pode ir até ${DIAS_MAXIMOS_ACESSO_SUPORTE} dias.`;
  return null;
}

export function validarMotivoAcesso(motivo: string): string | null {
  return motivo.trim().length >= 10 ? null : "Informe o motivo (mínimo 10 caracteres).";
}
