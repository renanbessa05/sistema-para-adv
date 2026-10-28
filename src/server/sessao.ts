import "server-only";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";

export type Papel = "socio" | "advogado" | "estagiario" | "administrativo";

export interface Sessao {
  usuarioId: string;
  email: string | null;
  escritorioId: string;
  papel: Papel;
  nome: string;
  accessToken: string;
}

function decodificarClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

/**
 * Sessão do usuário logado com os claims do escritório (gravados pelo Custom Access Token Hook).
 * Usuário logado sem vínculo ativo cai em /sem-escritorio.
 */
export async function obterSessao(): Promise<Sessao | null> {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  const claims = decodificarClaims(session.access_token);
  const app = (claims.app_metadata ?? {}) as Record<string, unknown>;
  const escritorioId = (claims.escritorio_id ?? app.escritorio_id) as string | undefined;
  const papel = (claims.papel ?? app.papel) as Papel | undefined;
  if (!escritorioId || !papel) return null;
  const nome = (user.user_metadata?.nome as string | undefined) ?? user.email?.split("@")[0] ?? "Usuário";
  return { usuarioId: user.id, email: user.email ?? null, escritorioId, papel, nome, accessToken: session.access_token };
}

export async function exigirSessao(): Promise<Sessao> {
  const s = await obterSessao();
  if (!s) redirect("/login");
  return s;
}

export function podeConfirmarPrazo(papel: Papel): boolean {
  return papel === "socio" || papel === "advogado";
}

export function ehSocio(papel: Papel): boolean {
  return papel === "socio";
}
