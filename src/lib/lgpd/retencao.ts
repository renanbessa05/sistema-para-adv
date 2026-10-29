/**
 * Retenção e descarte (LGPD). Puro: sem Next e sem Supabase.
 * Regra: nada é apagado por padrão. Só uma política ativada por sócio, com confirmação registrada, e de um tipo
 * com descarte automático, pode apagar linhas. Os demais tipos apenas listam candidatos.
 */

export const TIPOS_DADO = [
  { tipo: "mensagens_whatsapp", rotulo: "Mensagens do WhatsApp", descarteAutomatico: true },
  { tipo: "webhooks_inbox", rotulo: "Eventos de webhook já processados", descarteAutomatico: true },
  { tipo: "exportacoes_csv", rotulo: "Exportações CSV no armazenamento", descarteAutomatico: false },
  { tipo: "processos_encerrados", rotulo: "Processos arquivados ou baixados", descarteAutomatico: false },
  { tipo: "aprovacoes", rotulo: "Registros de aprovação", descarteAutomatico: false },
  { tipo: "auditoria_acessos", rotulo: "Auditoria de acesso a textos sigilosos", descarteAutomatico: false },
] as const;

export type TipoDado = (typeof TIPOS_DADO)[number]["tipo"];

/** Frase que o sócio digita para ativar o descarte (a mesma exigida pela RPC lgpd_configurar_politica). */
export const FRASE_ATIVAR_DESCARTE = "ATIVAR DESCARTE";

export const PRAZO_MAXIMO_MESES = 600;

export function tipoDadoValido(tipo: string): tipo is TipoDado {
  return TIPOS_DADO.some((t) => t.tipo === tipo);
}

export function descarteAutomatico(tipo: string): boolean {
  return TIPOS_DADO.some((t) => t.tipo === tipo && t.descarteAutomatico);
}

export function prazoMesesValido(valor: number | null): boolean {
  return valor === null || (Number.isInteger(valor) && valor >= 1 && valor <= PRAZO_MAXIMO_MESES);
}

/**
 * Data de corte (ISO UTC) para o descarte: `agora` menos `prazoMeses`, com o dia limitado ao último dia do mês
 * de destino (31/mar menos 1 mês = 28 ou 29/fev, e não 3/mar).
 */
export function corteDoDescarte(agora: Date, prazoMeses: number): string {
  const anoAlvo = agora.getUTCFullYear();
  const mesTotal = agora.getUTCMonth() - prazoMeses;
  const ano = anoAlvo + Math.floor(mesTotal / 12);
  const mes = ((mesTotal % 12) + 12) % 12;
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const dia = Math.min(agora.getUTCDate(), ultimoDia);
  return new Date(Date.UTC(ano, mes, dia, agora.getUTCHours(), agora.getUTCMinutes(), agora.getUTCSeconds(), agora.getUTCMilliseconds())).toISOString();
}

/**
 * Valida a configuração de uma política. Devolve o motivo do bloqueio ou null quando pode gravar.
 * Ativar exige prazo válido e a frase exata; desativar aceita prazo nulo (= sem descarte automático).
 */
export function validarConfiguracaoPolitica(entrada: { tipo: string; prazoMeses: number | null; ativar: boolean; confirmacao: string }): string | null {
  if (!tipoDadoValido(entrada.tipo)) return "Tipo de dado desconhecido.";
  if (!prazoMesesValido(entrada.prazoMeses)) return `O prazo deve ser um número inteiro de 1 a ${PRAZO_MAXIMO_MESES} meses.`;
  if (!entrada.ativar) return null;
  if (entrada.prazoMeses === null) return "Para ativar o descarte, informe o prazo em meses.";
  if (entrada.confirmacao.trim() !== FRASE_ATIVAR_DESCARTE) return `Confirmação ausente: digite ${FRASE_ATIVAR_DESCARTE}.`;
  return null;
}

/**
 * O que o job faz com uma política:
 * - 'nao_agir': sem prazo (NULL = sem descarte automático); nem lista.
 * - 'apagar': ativa, confirmada e de tipo com descarte automático.
 * - 'listar': demais casos; só conta os candidatos.
 */
export function acaoDescarte(politica: { tipo: string; prazoMeses: number | null; ativo: boolean; confirmado: boolean }): "nao_agir" | "listar" | "apagar" {
  if (politica.prazoMeses === null) return "nao_agir";
  if (politica.ativo && politica.confirmado && descarteAutomatico(politica.tipo)) return "apagar";
  return "listar";
}

/** Anonimização exige que o sócio digite o nome cadastrado do titular (comparação sem espaços nas pontas). */
export function confirmarAnonimizacao(digitado: string, nomeCadastrado: string): boolean {
  const nome = nomeCadastrado.trim();
  return nome.length > 0 && digitado.trim() === nome;
}
