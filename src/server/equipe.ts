import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { envServidor } from "@/lib/config/env";
import type { Papel } from "./sessao";

export interface Membro {
  id: string;
  usuario_id: string | null;
  email_convite: string;
  papel: Papel;
  nome_completo: string;
  oab_numero: string | null;
  oab_uf: string | null;
  oab_sufixo: string | null;
  nomes_alternativos: string[];
  ativo: boolean;
  aceito_em: string | null;
}

export const ROTULO_PAPEL: Record<Papel, string> = { socio: "Sócio(a)", advogado: "Advogado(a)", estagiario: "Estagiário(a)", administrativo: "Administrativo" };

/** Membros do escritório da sessão (a RLS já filtra pelo escritório; o filtro explícito é só defesa em profundidade). */
export async function listarMembros(supabase: SupabaseClient, escritorioId: string, opcoes: { somenteAtivos?: boolean } = {}): Promise<Membro[]> {
  let consulta = supabase
    .from("escritorio_membros")
    .select("id, usuario_id, email_convite, papel, nome_completo, oab_numero, oab_uf, oab_sufixo, nomes_alternativos, ativo, aceito_em")
    .eq("escritorio_id", escritorioId)
    .order("nome_completo");
  if (opcoes.somenteAtivos !== false) consulta = consulta.eq("ativo", true);
  const { data, error } = await consulta;
  if (error) throw new Error(`Falha ao listar equipe: ${error.message}`);
  return (data ?? []) as Membro[];
}

/** Mapa usuario_id → nome, para exibir responsável, executor e colaboradores. */
export function mapaNomes(membros: Membro[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const m of membros) if (m.usuario_id) mapa.set(m.usuario_id, m.nome_completo);
  return mapa;
}

/** Só quem já aceitou o convite (tem usuario_id) pode ser responsável, executor ou colaborador. */
export function membrosComUsuario(membros: Membro[]): (Membro & { usuario_id: string })[] {
  return membros.filter((m): m is Membro & { usuario_id: string } => Boolean(m.usuario_id));
}

/** Advogados e sócios ativos com usuário: candidatos a responsável de processo. */
export function advogadosESocios(membros: Membro[]): (Membro & { usuario_id: string })[] {
  return membrosComUsuario(membros).filter((m) => m.papel === "socio" || m.papel === "advogado");
}

/**
 * Localiza um membro por e-mail ou nome (inclui nomes alternativos), sem acento e sem caixa.
 * Usado pela importação de carteira para resolver responsável e colaboradores.
 */
export function localizarMembro(membros: Membro[], texto: string): Membro | null {
  const alvo = normalizar(texto);
  if (!alvo) return null;
  for (const m of membros) {
    if (normalizar(m.email_convite) === alvo) return m;
  }
  for (const m of membros) {
    const nomes = [m.nome_completo, ...(m.nomes_alternativos ?? [])].map(normalizar);
    if (nomes.includes(alvo)) return m;
  }
  for (const m of membros) {
    const nomes = [m.nome_completo, ...(m.nomes_alternativos ?? [])].map(normalizar);
    if (nomes.some((n) => n.includes(alvo) || alvo.includes(n))) return m;
  }
  return null;
}

function normalizar(texto: string): string {
  return (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Convida um membro: a linha em escritorio_membros é gravada antes, pelo cliente do sócio (RLS),
 * com usuario_id nulo; o convite do Auth cria o usuário e a trigger vincular_membro_por_email o liga à linha.
 * Service role só para o convite em si.
 */
export async function enviarConvite(email: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const admin = criarClienteAdmin();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${envServidor().APP_URL}/auth/callback` });
  if (error) {
    // Usuário já existente no Auth: a trigger não dispara, mas o vínculo pode ser feito manualmente pela equipe.
    if (/already|registered|exists/i.test(error.message)) return { ok: false, erro: "Este e-mail já tem usuário no sistema. Peça que entre com o e-mail: o vínculo ao escritório será conferido pelo suporte." };
    return { ok: false, erro: `Não foi possível enviar o convite: ${error.message}` };
  }
  return { ok: true };
}

export interface Telefone {
  id: string;
  usuario_id: string;
  telefone_e164: string;
  verificado_em: string | null;
  codigo_expira_em: string | null;
  principal: boolean;
  ativo: boolean;
}

export async function listarTelefones(supabase: SupabaseClient, escritorioId: string): Promise<Telefone[]> {
  const { data, error } = await supabase.from("usuario_telefones").select("id, usuario_id, telefone_e164, verificado_em, codigo_expira_em, principal, ativo").eq("escritorio_id", escritorioId).eq("ativo", true);
  if (error) throw new Error(`Falha ao listar telefones: ${error.message}`);
  return (data ?? []) as Telefone[];
}
