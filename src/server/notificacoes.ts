import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { planejarNotificacoes, type Ausencia, type EventoNotificacao, type Membro } from "@/lib/notificacoes";
import { criarClienteWhatsapp, dentroDaJanela24h, montarEnvioTemplate, type NomeTemplate } from "@/lib/whatsapp";
import { envServidor } from "@/lib/config/env";
import { enviarEmail } from "./email";

export interface ContextoEscritorio {
  id: string;
  timezone: string;
  membros: Membro[];
  telefones: Map<string, string>; // usuarioId → E.164
  emails: Map<string, string>;
  ausencias: Ausencia[];
  feriados: string[];
}

/** Carrega membros, telefones verificados, e-mails, ausências e feriados de um escritório (service role). */
export async function carregarContexto(admin: SupabaseClient, escritorioId: string): Promise<ContextoEscritorio> {
  const [{ data: esc }, { data: membros }, { data: telefones }, { data: ausencias }, { data: feriados }] = await Promise.all([
    admin.from("escritorios").select("timezone").eq("id", escritorioId).single(),
    admin.from("escritorio_membros").select("usuario_id, nome_completo, papel, ativo, email_convite").eq("escritorio_id", escritorioId).not("usuario_id", "is", null),
    admin.from("usuario_telefones").select("usuario_id, telefone_e164").eq("escritorio_id", escritorioId).eq("ativo", true).not("verificado_em", "is", null).not("opt_in_em", "is", null),
    admin.from("ausencias").select("usuario_id, inicio, fim, substituto_id").eq("escritorio_id", escritorioId),
    admin.schema("ref").from("feriados").select("data").eq("suspende_prazo", true),
  ]);
  const mapaTel = new Map<string, string>();
  for (const t of telefones ?? []) mapaTel.set(t.usuario_id as string, t.telefone_e164 as string);
  const mapaEmail = new Map<string, string>();
  const lista: Membro[] = [];
  for (const m of membros ?? []) {
    const id = m.usuario_id as string;
    if (m.email_convite) mapaEmail.set(id, m.email_convite as string);
    lista.push({ id, nome: m.nome_completo as string, papel: m.papel as Membro["papel"], ativo: Boolean(m.ativo), telefoneVerificado: mapaTel.has(id), emailVerificado: Boolean(m.email_convite) });
  }
  return {
    id: escritorioId,
    timezone: (esc?.timezone as string | undefined) ?? "America/Cuiaba",
    membros: lista,
    telefones: mapaTel,
    emails: mapaEmail,
    ausencias: (ausencias ?? []).map((a) => ({ usuarioId: a.usuario_id as string, inicio: String(a.inicio), fim: String(a.fim), substitutoId: (a.substituto_id as string | null) ?? undefined })),
    feriados: (feriados ?? []).map((f) => String(f.data)),
  };
}

export interface EventoParaEnfileirar {
  evento: EventoNotificacao;
  objeto: { tipo: string; id: string };
  /** Variáveis posicionais do template ("1", "2"...) e livres (texto, assunto, html, link). */
  variaveis: Record<string, string>;
  responsavelId?: string;
  usuarioAlvoId?: string;
  agora?: Date;
}

/** Planeja pelas regras e grava em `notificacoes`; duplicatas (chave_dedup) são ignoradas. Devolve quantas entraram. */
export async function enfileirarEvento(admin: SupabaseClient, ctx: ContextoEscritorio, e: EventoParaEnfileirar): Promise<number> {
  const planejadas = planejarNotificacoes({
    evento: e.evento,
    agora: e.agora ?? new Date(),
    tz: ctx.timezone,
    feriados: ctx.feriados,
    membros: ctx.membros,
    responsavelId: e.responsavelId,
    usuarioAlvoId: e.usuarioAlvoId,
    ausencias: ctx.ausencias,
    objeto: e.objeto,
    variaveis: e.variaveis,
  });
  let inseridas = 0;
  for (const n of planejadas) {
    const { error } = await admin.from("notificacoes").upsert(
      { escritorio_id: ctx.id, evento: n.evento, destinatario_id: n.destinatarioId, canal: n.canal, template: n.template ?? null, variaveis: { ...n.variaveis, _motivo: n.motivo ?? "", _substitui_a: n.substituiA ?? "" }, objeto_tipo: e.objeto.tipo, objeto_id: e.objeto.id, agendada_para: n.agendadaPara, status: "pendente", chave_dedup: n.chaveDedup },
      { onConflict: "chave_dedup", ignoreDuplicates: true },
    );
    if (!error) inseridas += 1;
  }
  return inseridas;
}

function posicionais(variaveis: Record<string, string>): string[] {
  return Object.keys(variaveis)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => variaveis[k]);
}

/** Envia as notificações pendentes já vencidas, por canal. */
export async function drenarNotificacoes(admin: SupabaseClient, opcoes: { limite?: number; agora?: Date } = {}): Promise<{ enviadas: number; falhas: number; painel: number }> {
  const env = envServidor();
  const agora = opcoes.agora ?? new Date();
  const { data: pendentes, error } = await admin.from("notificacoes").select("id, escritorio_id, evento, destinatario_id, canal, template, variaveis, tentativas").eq("status", "pendente").lte("agendada_para", agora.toISOString()).order("agendada_para").limit(opcoes.limite ?? 100);
  if (error) throw new Error(error.message);

  const whatsapp = env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID ? criarClienteWhatsapp({ accessToken: env.WHATSAPP_ACCESS_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID }) : null;
  const contextos = new Map<string, ContextoEscritorio>();
  let enviadas = 0;
  let falhas = 0;
  let painel = 0;

  for (const n of pendentes ?? []) {
    const escritorioId = n.escritorio_id as string;
    if (!contextos.has(escritorioId)) contextos.set(escritorioId, await carregarContexto(admin, escritorioId));
    const ctx = contextos.get(escritorioId)!;
    const vars = (n.variaveis ?? {}) as Record<string, string>;
    const destinatario = n.destinatario_id as string;
    const marcar = async (status: "enviada" | "falhou", extra: Record<string, unknown> = {}) => {
      await admin.from("notificacoes").update({ status, tentativas: (n.tentativas ?? 0) + 1, enviada_em: status === "enviada" ? new Date().toISOString() : null, ...extra }).eq("id", n.id);
    };

    try {
      if (n.canal === "painel") {
        await marcar("enviada");
        painel += 1;
        continue;
      }
      if (n.canal === "email") {
        const email = ctx.emails.get(destinatario);
        if (!email) throw new Error("destinatário sem e-mail");
        const r = await enviarEmail({ para: email, assunto: vars.assunto ?? `Assistente Jurídica: ${n.evento}`, html: vars.html ?? `<p>${vars.texto ?? ""}</p>`, texto: vars.texto });
        if (!r.ok) throw new Error(r.erro ?? "falha no e-mail");
        await marcar("enviada");
        enviadas += 1;
        continue;
      }
      if (n.canal === "whatsapp") {
        if (!whatsapp) throw new Error("WhatsApp não configurado");
        const telefone = ctx.telefones.get(destinatario);
        if (!telefone) throw new Error("destinatário sem telefone verificado");
        const { data: conversa } = await admin.from("conversas").select("id, ultima_mensagem_recebida_em").eq("escritorio_id", escritorioId).eq("canal", "whatsapp").eq("telefone_e164", telefone).maybeSingle();
        const naJanela = dentroDaJanela24h((conversa?.ultima_mensagem_recebida_em as string | null) ?? null, agora);
        const r = naJanela && vars.texto ? await whatsapp.enviarTexto(telefone, vars.texto) : await whatsapp.enviarTemplate(telefone, montarEnvioTemplate((n.template ?? "alerta_prazo") as NomeTemplate, posicionais(vars)));
        if (!r.ok) throw new Error(`${r.erro.codigo}: ${r.erro.mensagem}`);
        let conversaId = conversa?.id as string | undefined;
        if (!conversaId) {
          const { data: nova } = await admin.from("conversas").insert({ escritorio_id: escritorioId, canal: "whatsapp", usuario_id: destinatario, telefone_e164: telefone, aberta: true }).select("id").single();
          conversaId = nova?.id as string | undefined;
        }
        if (conversaId) {
          const { data: msg } = await admin.from("mensagens").insert({ escritorio_id: escritorioId, conversa_id: conversaId, direcao: "saida", id_externo: r.wamid, tipo: naJanela && vars.texto ? "text" : "template", texto: vars.texto ?? null, template_nome: naJanela && vars.texto ? null : n.template, status_entrega: "enviada" }).select("id").single();
          await marcar("enviada", { mensagem_id: msg?.id ?? null });
        } else {
          await marcar("enviada");
        }
        enviadas += 1;
        continue;
      }
      throw new Error(`canal desconhecido: ${n.canal}`);
    } catch (e) {
      falhas += 1;
      const tentativas = (n.tentativas ?? 0) + 1;
      // Até 3 tentativas com 10 minutos de intervalo; depois falha definitiva.
      if (tentativas < 3) {
        await admin.from("notificacoes").update({ tentativas, erro: e instanceof Error ? e.message : String(e), agendada_para: new Date(agora.getTime() + 10 * 60_000).toISOString() }).eq("id", n.id);
      } else {
        await marcar("falhou", { erro: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  return { enviadas, falhas, painel };
}
