import "server-only";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";

export type Papel = "socio" | "advogado" | "estagiario" | "administrativo" | "suporte";

/** Escritório ao qual o usuário pode trocar: vínculo de membro ou acesso de suporte vigente (docs/adr/0014). */
export interface Vinculo {
  escritorioId: string;
  nome: string;
  papel: Papel;
  origem: "membro" | "acesso_suporte";
}

export interface Sessao {
  usuarioId: string;
  email: string | null;
  escritorioId: string;
  papel: Papel;
  nome: string;
  accessToken: string;
  vinculos: Vinculo[];
}

function decodificarClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

/** Lista os escritórios disponíveis para o seletor. Falha de leitura vira lista vazia (o escritório atual segue válido). */
export async function listarVinculos(): Promise<Vinculo[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("listar_vinculos");
  if (error || !data) return [];
  return (data as { escritorio_id: string; nome: string; papel: Papel; origem: Vinculo["origem"] }[]).map((v) => ({
    escritorioId: v.escritorio_id,
    nome: v.nome,
    papel: v.papel,
    origem: v.origem,
  }));
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
  const vinculos = await listarVinculos();
  return { usuarioId: user.id, email: user.email ?? null, escritorioId, papel, nome, accessToken: session.access_token, vinculos };
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

/** Suporte entra só para ver e nunca escreve: as policies e as RPCs de decisão já recusam; a UI também esconde ações. */
export function ehSuporte(papel: Papel): boolean {
  return papel === "suporte";
}
