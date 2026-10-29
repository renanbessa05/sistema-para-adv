import "server-only";
import type { Sessao } from "./sessao";

/**
 * MFA (TOTP) obrigatório para sócio e advogado: quem não tem fator verificado vai cadastrar;
 * quem tem, mas entrou só com senha (aal1), vai validar o código. Implementação na pendência "MFA" da Fase 1.
 */
export async function exigirMfaSeNecessario(_sessao: Sessao): Promise<void> {
  void _sessao;
}
