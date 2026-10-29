import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { envServidor } from "@/lib/config/env";
import type { Papel } from "./sessao";
import { enviarEmail, type Email } from "./email";

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

export const ROTULO_PAPEL: Record<Papel, string> = { socio: "Sócio(a)", advogado: "Advogado(a)", estagiario: "Estagiário(a)", administrativo: "Administrativo", suporte: "Suporte (leitura)" };

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

export type ResultadoConvite = { ok: true; aviso?: string } | { ok: false; erro: string };

/**
 * Convida um membro: a linha em escritorio_membros é gravada antes, pelo cliente do sócio (RLS), com usuario_id
 * nulo; o convite do Auth cria o usuário e a trigger vincular_membro_por_email o liga à linha (o clique no e-mail
 * de convite é o aceite). Service role só para o convite em si.
 *
 * Se o e-mail já tem usuário no Auth, a trigger não dispara: a RPC vincular_membro_existente (service role) liga o
 * usuário à linha pendente DESTE escritório sem aceitar por ele; a pessoa recebe um e-mail e aceita em
 * /convite/aceitar. Só depois do aceite o escritório entra nos claims (próximo login/refresh) e no WhatsApp.
 */
export async function enviarConvite(email: string, escritorio: { id: string; nome: string }): Promise<ResultadoConvite> {
  const admin = criarClienteAdmin();
  const redirectTo = `${envServidor().APP_URL}/auth/callback`;
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (!error) return { ok: true };
  if (!/already|registered|exists/i.test(error.message)) return { ok: false, erro: `Não foi possível enviar o convite: ${error.message}` };
  return vincularUsuarioExistente(admin, email, escritorio);
}

async function vincularUsuarioExistente(admin: SupabaseClient, email: string, escritorio: { id: string; nome: string }): Promise<ResultadoConvite> {
  const { data: usuarioId, error: erroVinculo } = await admin.rpc("vincular_membro_existente", { p_email: email, p_escritorio_id: escritorio.id });
  if (erroVinculo) return { ok: false, erro: `Este e-mail já tem usuário no sistema e o vínculo falhou: ${erroVinculo.message}` };
  if (!usuarioId) return { ok: false, erro: "Este e-mail já tem usuário no sistema, mas não havia convite pendente para vincular." };

  const env = envServidor();
  const urlAceite = `${env.APP_URL}/convite/aceitar`;
  const avisoBase = `Usuário já existia: o convite fica pendente até a pessoa aceitar em ${urlAceite} (entrando com o próprio e-mail).`;
  if (!env.RESEND_API_KEY || !env.EMAIL_REMETENTE) return { ok: true, aviso: `${avisoBase} Sem e-mail configurado, avise a pessoa você mesmo.` };

  const envio = await enviarEmail(emailDeConvitePendente(email, escritorio.nome, urlAceite));
  if (!envio.ok) return { ok: true, aviso: `${avisoBase} O e-mail não foi enviado (${envio.erro ?? "erro"}); avise a pessoa você mesmo.` };
  return { ok: true, aviso: "Usuário já existia: convite registrado e e-mail enviado; ele vale depois que a pessoa aceitar." };
}

/** Reenvia o e-mail de aceite para quem já tem usuário mas ainda não aceitou o convite (aceito_em nulo). */
export async function reenviarAcessoPendente(email: string, escritorio: { id: string; nome: string }): Promise<ResultadoConvite> {
  const env = envServidor();
  const urlAceite = `${env.APP_URL}/convite/aceitar`;
  if (!env.RESEND_API_KEY || !env.EMAIL_REMETENTE) return { ok: true, aviso: `Sem e-mail configurado: peça que a pessoa entre com o próprio e-mail e aceite em ${urlAceite}.` };
  const envio = await enviarEmail(emailDeConvitePendente(email, escritorio.nome, urlAceite));
  if (!envio.ok) return { ok: false, erro: `O e-mail não foi enviado (${envio.erro ?? "erro"}).` };
  return { ok: true, aviso: "E-mail de aceite reenviado." };
}

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function emailDeConvitePendente(email: string, escritorioNome: string, urlAceite: string): Email {
  const nome = escaparHtml(escritorioNome);
  return {
    para: email,
    assunto: `Convite para a equipe de ${escritorioNome} na Assistente Jurídica`,
    html: `<p>Olá,</p>
<p>Sua conta (${escaparHtml(email)}) foi convidada para a equipe de <strong>${nome}</strong> na Assistente Jurídica.</p>
<p>Nada muda até você aceitar. Para aceitar, entre com o seu e-mail e abra:</p>
<p><a href="${escaparHtml(urlAceite)}">${escaparHtml(urlAceite)}</a></p>
<p>Se não reconhece este convite, ignore este e-mail.</p>`,
    texto: `Sua conta (${email}) foi convidada para a equipe de ${escritorioNome} na Assistente Jurídica.\nNada muda até você aceitar. Para aceitar, entre com o seu e-mail e abra: ${urlAceite}\nSe não reconhece este convite, ignore este e-mail.`,
  };
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
