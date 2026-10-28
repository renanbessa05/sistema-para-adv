/**
 * Janela de atendimento de 24 h da WhatsApp Cloud API.
 *
 * Cada mensagem recebida do usuário abre (ou reinicia) uma janela de 24 h.
 * Dentro dela o sistema pode responder com texto livre; fora dela só pode
 * enviar templates aprovados (categoria utility). Ver docs/escopo-revisado.md 1.3.4.
 */

export const JANELA_24H_MS = 24 * 60 * 60 * 1000;

/**
 * @param ultimaMensagemRecebidaEm instante (ISO 8601) da última mensagem que o
 *   usuário enviou ao número do escritório; null quando nunca escreveu.
 * @param agora instante de referência.
 */
export function dentroDaJanela24h(ultimaMensagemRecebidaEm: string | null | undefined, agora: Date): boolean {
  const restante = restanteNaJanelaMs(ultimaMensagemRecebidaEm, agora);
  return restante !== null && restante > 0;
}

/**
 * Milissegundos que faltam para a janela fechar; 0 quando já fechou; null quando
 * nunca houve mensagem ou a data é inválida. Instante futuro (relógio adiantado)
 * é tratado como mensagem recém-chegada.
 */
export function restanteNaJanelaMs(ultimaMensagemRecebidaEm: string | null | undefined, agora: Date): number | null {
  if (!ultimaMensagemRecebidaEm) return null;
  const instante = Date.parse(ultimaMensagemRecebidaEm);
  if (Number.isNaN(instante)) return null;
  const decorrido = Math.max(0, agora.getTime() - instante);
  return Math.max(0, JANELA_24H_MS - decorrido);
}
