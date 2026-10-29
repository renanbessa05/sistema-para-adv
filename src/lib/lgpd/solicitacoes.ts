/** Pedidos dos titulares (LGPD, art. 18). Puro. O prazo de resposta é informado pelo registrador: não há prazo fixo aqui. */

export const TIPOS_SOLICITACAO = [
  { tipo: "acesso", rotulo: "Acesso aos dados" },
  { tipo: "correcao", rotulo: "Correção" },
  { tipo: "eliminacao", rotulo: "Eliminação (anonimização)" },
  { tipo: "portabilidade", rotulo: "Portabilidade" },
  { tipo: "revogacao", rotulo: "Revogação do consentimento" },
] as const;

export type TipoSolicitacao = (typeof TIPOS_SOLICITACAO)[number]["tipo"];

export function rotuloSolicitacao(tipo: string): string {
  return TIPOS_SOLICITACAO.find((t) => t.tipo === tipo)?.rotulo ?? tipo;
}

/** Valida um pedido novo. Devolve o motivo do bloqueio ou null. Prazo em YYYY-MM-DD. */
export function validarSolicitacao(entrada: { tipo: string; titularNome: string; prazo: string }): string | null {
  if (!TIPOS_SOLICITACAO.some((t) => t.tipo === entrada.tipo)) return "Tipo de pedido desconhecido.";
  if (entrada.titularNome.trim().length === 0) return "Informe o nome do titular.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.prazo)) return "Informe o prazo de resposta (a confirmar).";
  return null;
}
