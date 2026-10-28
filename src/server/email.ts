import "server-only";
import { envServidor } from "@/lib/config/env";

export interface Email {
  para: string | string[];
  assunto: string;
  html: string;
  texto?: string;
  anexos?: { nome: string; conteudoBase64: string }[];
}

/** Envia e-mail pela API da Resend. Sem chave configurada, registra e devolve ok=false sem lançar. */
export async function enviarEmail(email: Email, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; id: string | null; erro: string | null }> {
  const env = envServidor();
  if (!env.RESEND_API_KEY || !env.EMAIL_REMETENTE) {
    console.warn("[email] RESEND_API_KEY ou EMAIL_REMETENTE ausente; e-mail não enviado:", email.assunto);
    return { ok: false, id: null, erro: "e-mail não configurado" };
  }
  try {
    const resposta = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_REMETENTE,
        to: Array.isArray(email.para) ? email.para : [email.para],
        subject: email.assunto,
        html: email.html,
        text: email.texto,
        attachments: email.anexos?.map((a) => ({ filename: a.nome, content: a.conteudoBase64 })),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const corpo = (await resposta.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!resposta.ok) return { ok: false, id: null, erro: corpo.message ?? `HTTP ${resposta.status}` };
    return { ok: true, id: corpo.id ?? null, erro: null };
  } catch (e) {
    return { ok: false, id: null, erro: e instanceof Error ? e.message : String(e) };
  }
}
