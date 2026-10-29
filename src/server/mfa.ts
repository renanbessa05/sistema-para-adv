import "server-only";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Papel, Sessao } from "./sessao";

/** Papéis que só entram no painel com segundo fator (docs/regras/permissoes.md, "Segundo fator"). */
export function exigeMfa(papel: Papel): boolean {
  return papel === "socio" || papel === "advogado";
}

export type FatorMfa = {
  id: string;
  nome: string | null;
  tipo: string;
  status: "verified" | "unverified" | string;
  criadoEm: string;
};

/** Fatores do usuário logado (verificados e pendentes), como o Supabase Auth os guarda. */
export async function listarFatores(): Promise<FatorMfa[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(`Não foi possível listar os fatores de autenticação: ${error.message}`);
  return (data?.all ?? []).map((f) => ({ id: f.id, nome: f.friendly_name ?? null, tipo: f.factor_type, status: f.status, criadoEm: f.created_at }));
}

/**
 * MFA (TOTP) obrigatório para sócio e advogado: quem não tem fator verificado vai cadastrar; quem tem,
 * mas entrou só com senha ou link (aal1), vai validar o código. O banco aplica a mesma regra por policy
 * restritiva (app.mfa_satisfeita), então este redirecionamento é conveniência, não a barreira.
 * Outros papéis não são exigidos.
 */
export async function exigirMfaSeNecessario(sessao: Sessao): Promise<void> {
  if (!exigeMfa(sessao.papel)) return;
  const supabase = await criarClienteServidor();
  const [fatores, nivel] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
  if (fatores.error) throw new Error(`Não foi possível verificar o segundo fator: ${fatores.error.message}`);
  if (nivel.error) throw new Error(`Não foi possível verificar o nível da sessão: ${nivel.error.message}`);
  // `totp` só traz fatores verificados; `all` inclui os pendentes de verificação.
  const temTotpVerificado = (fatores.data?.totp ?? []).length > 0;
  if (!temTotpVerificado) redirect("/mfa/cadastro");
  if (nivel.data?.currentLevel !== "aal2") redirect("/mfa");
}
