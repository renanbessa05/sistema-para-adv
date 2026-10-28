import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verificação do webhook da WhatsApp Cloud API.
 *
 * A Meta assina cada entrega com o cabeçalho `X-Hub-Signature-256`, no formato
 * `sha256=<hex>`, onde `<hex>` é o HMAC-SHA256 do corpo bruto da requisição
 * usando o *app secret* como chave. O corpo precisa ser o texto exatamente como
 * chegou (por exemplo `await request.text()`): se for reserializado a partir do
 * JSON já parseado a assinatura deixa de bater.
 */

export interface ParametrosVerificarAssinatura {
  /** Corpo bruto da requisição, sem reserialização. */
  corpoBruto: string | Buffer;
  /** Valor do cabeçalho `X-Hub-Signature-256` (null quando ausente). */
  cabecalho: string | null | undefined;
  /** App secret do aplicativo Meta (nunca o access token). */
  appSecret: string;
}

const PADRAO_CABECALHO = /^sha256=([0-9a-fA-F]{64})$/;

/** Compara dois buffers em tempo constante; false quando tamanhos divergem. */
function igualTempoConstante(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Devolve true só quando o cabeçalho existe, está bem formado e o HMAC do corpo
 * confere com o esperado. Qualquer defeito (cabeçalho ausente, prefixo errado,
 * hex com tamanho inválido, segredo vazio) devolve false sem lançar.
 */
export function verificarAssinatura({
  corpoBruto,
  cabecalho,
  appSecret,
}: ParametrosVerificarAssinatura): boolean {
  if (!cabecalho || !appSecret) return false;
  const correspondencia = PADRAO_CABECALHO.exec(cabecalho.trim());
  if (!correspondencia) return false;

  const recebido = Buffer.from(correspondencia[1], "hex");
  const esperado = createHmac("sha256", appSecret)
    .update(typeof corpoBruto === "string" ? Buffer.from(corpoBruto, "utf8") : corpoBruto)
    .digest();

  return igualTempoConstante(esperado, recebido);
}

export interface ParametrosVerificacaoWebhook {
  hubMode: string | null | undefined;
  hubVerifyToken: string | null | undefined;
  hubChallenge: string | null | undefined;
  verifyTokenEsperado: string;
}

export type RespostaVerificacaoWebhook = { ok: true; challenge: string } | { ok: false };

/**
 * Responde ao GET de verificação que a Meta faz ao cadastrar o webhook:
 * `hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`.
 * Quando tudo confere, o endpoint deve devolver `challenge` em texto puro com 200.
 */
export function responderVerificacaoWebhook({
  hubMode,
  hubVerifyToken,
  hubChallenge,
  verifyTokenEsperado,
}: ParametrosVerificacaoWebhook): RespostaVerificacaoWebhook {
  if (hubMode !== "subscribe") return { ok: false };
  if (!hubVerifyToken || !verifyTokenEsperado || !hubChallenge) return { ok: false };
  const confere = igualTempoConstante(
    Buffer.from(hubVerifyToken, "utf8"),
    Buffer.from(verifyTokenEsperado, "utf8"),
  );
  if (!confere) return { ok: false };
  return { ok: true, challenge: hubChallenge };
}
