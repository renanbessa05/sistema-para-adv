/** Só aceita caminhos internos como destino depois do segundo fator (evita open redirect). */
export function destinoSeguro(voltar: string | undefined | null, padrao = "/hoje"): string {
  const v = typeof voltar === "string" ? voltar : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : padrao;
}
