/**
 * Utilitários mínimos de número CNJ para o módulo DJEN.
 *
 * Aqui só extraímos e mascaramos os 20 dígitos. A validação do dígito
 * verificador (módulo 97) e as demais regras do padrão CNJ ficam em
 * `src/lib/cnj`, que é de responsabilidade de outro módulo.
 */

/** Devolve os 20 dígitos de um número CNJ (com ou sem máscara) ou null se não houver exatamente 20. */
export function extrairDigitosCnj(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const digitos = valor.replace(/\D/g, "");
  return digitos.length === 20 ? digitos : null;
}

/** Aplica a máscara NNNNNNN-DD.AAAA.J.TR.OOOO a 20 dígitos. Devolve a entrada intacta se não tiver 20 dígitos. */
export function mascararCnj(digitos: string): string {
  const d = digitos.replace(/\D/g, "");
  if (d.length !== 20) return digitos;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}
