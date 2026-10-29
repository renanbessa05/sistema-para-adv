/**
 * Só aceita caminho interno como destino depois de login ou segundo fator (evita open redirect).
 * Regras: começa com uma única barra; não contém barra invertida (o navegador trata "\" como "/", então
 * "/\evil.com" viraria "//evil.com"); não contém esquema; quando resolvido contra uma origem fictícia,
 * continua na mesma origem.
 */
export function destinoSeguro(voltar: unknown, padrao = "/hoje"): string {
  if (typeof voltar !== "string") return padrao;
  const v = voltar.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || /[\u0000-\u001f]/.test(v)) return padrao;
  if (/^\/%5c/i.test(v) || /^\/%2f/i.test(v)) return padrao;
  try {
    const base = "http://interno.local";
    const url = new URL(v, base);
    if (url.origin !== base) return padrao;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return padrao;
  }
}
