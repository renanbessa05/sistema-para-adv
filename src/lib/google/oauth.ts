/**
 * OAuth do Google (código de autorização, PKCE à parte): monta a URL de consentimento e troca o código por token.
 * Os tokens do usuário vão para o Vault (migration de OAuth, não nesta etapa); aqui só o protocolo.
 */
export const URL_AUTORIZACAO = "https://accounts.google.com/o/oauth2/v2/auth";
export const URL_TOKEN = "https://oauth2.googleapis.com/token";
export const ESCOPOS_GOOGLE = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/drive.file"] as const;

export function urlAutorizacao(o: { clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: "code",
    scope: ESCOPOS_GOOGLE.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: o.state,
  });
  return `${URL_AUTORIZACAO}?${q.toString()}`;
}

export interface TokenGoogle {
  accessToken: string;
  refreshToken: string | null;
  expiraEm: Date;
}

export async function trocarCodigo(
  f: typeof fetch,
  o: { clientId: string; clientSecret: string; redirectUri: string; code: string; agora?: Date },
): Promise<TokenGoogle> {
  const resp = await f(URL_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: o.clientId, client_secret: o.clientSecret, redirect_uri: o.redirectUri, grant_type: "authorization_code", code: o.code }),
  });
  if (!resp.ok) throw new Error(`Google recusou o código (${resp.status})`);
  const corpo = (await resp.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!corpo.access_token || !corpo.expires_in) throw new Error("Resposta do Google sem access_token");
  const agora = o.agora ?? new Date();
  return {
    accessToken: corpo.access_token,
    refreshToken: corpo.refresh_token ?? null,
    expiraEm: new Date(agora.getTime() + corpo.expires_in * 1000),
  };
}
