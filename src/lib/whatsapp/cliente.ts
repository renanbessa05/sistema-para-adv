/**
 * Cliente mínimo da WhatsApp Cloud API (Graph API), sem dependências.
 *
 * Toda chamada devolve `ResultadoEnvio` e nunca lança: erro da Graph API, erro
 * de rede e resposta fora do formato esperado viram `{ ok: false, erro }`.
 * O access token só é usado no cabeçalho `Authorization` e nunca entra em
 * mensagens de erro, logs ou no campo `detalhe`.
 */

export type FetchImpl = (entrada: string, init?: RequestInit) => Promise<Response>;

export interface OpcoesClienteWhatsapp {
  /** Token de usuário de sistema com `whatsapp_business_messaging`. */
  accessToken: string;
  /** ID do número de telefone (não é o número em si). */
  phoneNumberId: string;
  fetchImpl?: FetchImpl;
  /** Versão da Graph API; padrão "v22.0" (a confirmar quando houver mudança de versão). */
  versaoGraph?: string;
  /** Base da Graph API; permite apontar para um mock em testes. */
  baseUrl?: string;
  /** Tempo máximo por requisição, em ms. */
  timeoutMs?: number;
}

export interface ErroEnvio {
  /** `error.code` da Graph API, ou uma categoria interna ("rede", "http", "resposta_invalida"). */
  codigo: number | string;
  mensagem: string;
  /** Dados adicionais seguros (sem token): error_subcode, fbtrace_id, status HTTP etc. */
  detalhe?: Record<string, unknown>;
}

export type ResultadoEnvio = { ok: true; wamid: string } | { ok: false; erro: ErroEnvio };

export interface OpcoesTexto {
  /** Gera prévia de links no corpo. */
  previewUrl?: boolean;
}

/** Parâmetro de componente de template; o MVP usa só `text`. */
export interface ParametroTemplate {
  type: "text";
  text: string;
}

export interface ComponenteTemplate {
  type: "header" | "body" | "button";
  sub_type?: "quick_reply" | "url";
  index?: string;
  parameters: ParametroTemplate[];
}

export interface EnvioTemplate {
  nome: string;
  /** Código de idioma do template aprovado; padrão "pt_BR". */
  idioma?: string;
  componentes: ComponenteTemplate[];
}

export interface ClienteWhatsapp {
  enviarTexto(para: string, texto: string, opcoes?: OpcoesTexto): Promise<ResultadoEnvio>;
  enviarTemplate(para: string, template: EnvioTemplate): Promise<ResultadoEnvio>;
  /** Marca a mensagem recebida como lida (dois tiques azuis). Devolve o mesmo wamid. */
  marcarComoLida(wamid: string): Promise<ResultadoEnvio>;
}

/** Monta o componente `body` de um template a partir dos valores das variáveis {{1}}, {{2}}... */
export function componentesCorpo(valores: string[]): ComponenteTemplate[] {
  if (valores.length === 0) return [];
  return [
    {
      type: "body",
      parameters: valores.map((text) => ({ type: "text" as const, text })),
    },
  ];
}

/** Normaliza o destinatário para E.164 sem "+" (só dígitos), como a Graph API espera. */
export function normalizarDestinatario(para: string): string {
  return para.replace(/\D/g, "");
}

interface RespostaGraphSucesso {
  messaging_product?: string;
  contacts?: Array<{ input?: string; wa_id?: string }>;
  messages?: Array<{ id?: string; message_status?: string }>;
  success?: boolean;
}

interface RespostaGraphErro {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
    error_data?: { details?: string };
  };
}

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  if (typeof erro === "string") return erro;
  return "erro desconhecido";
}

export function criarClienteWhatsapp({
  accessToken,
  phoneNumberId,
  fetchImpl,
  versaoGraph = "v22.0",
  baseUrl = "https://graph.facebook.com",
  timeoutMs = 15_000,
}: OpcoesClienteWhatsapp): ClienteWhatsapp {
  if (!accessToken) throw new Error("accessToken é obrigatório");
  if (!phoneNumberId) throw new Error("phoneNumberId é obrigatório");

  const executarFetch: FetchImpl = fetchImpl ?? ((entrada, init) => fetch(entrada, init));
  const urlMensagens = `${baseUrl.replace(/\/$/, "")}/${versaoGraph}/${phoneNumberId}/messages`;

  async function chamar(corpo: Record<string, unknown>, wamidFallback?: string): Promise<ResultadoEnvio> {
    let resposta: Response;
    try {
      const signal =
        typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
          ? AbortSignal.timeout(timeoutMs)
          : undefined;
      resposta = await executarFetch(urlMensagens, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(corpo),
        signal,
      });
    } catch (erro) {
      return {
        ok: false,
        erro: { codigo: "rede", mensagem: `Falha de rede ao chamar a Graph API: ${mensagemDeErro(erro)}` },
      };
    }

    let json: (RespostaGraphSucesso & RespostaGraphErro) | null = null;
    try {
      json = (await resposta.json()) as RespostaGraphSucesso & RespostaGraphErro;
    } catch {
      json = null;
    }

    if (json?.error) {
      const { error } = json;
      return {
        ok: false,
        erro: {
          codigo: error.code ?? "graph",
          mensagem: error.message ?? "Erro da Graph API sem mensagem",
          detalhe: {
            httpStatus: resposta.status,
            type: error.type,
            error_subcode: error.error_subcode,
            error_user_title: error.error_user_title,
            error_user_msg: error.error_user_msg,
            fbtrace_id: error.fbtrace_id,
            details: error.error_data?.details,
          },
        },
      };
    }

    if (!resposta.ok) {
      return {
        ok: false,
        erro: {
          codigo: "http",
          mensagem: `Graph API respondeu HTTP ${resposta.status}`,
          detalhe: { httpStatus: resposta.status },
        },
      };
    }

    const wamid = json?.messages?.[0]?.id ?? (json?.success && wamidFallback ? wamidFallback : undefined);
    if (!wamid) {
      return {
        ok: false,
        erro: {
          codigo: "resposta_invalida",
          mensagem: "Graph API respondeu sem identificador de mensagem",
          detalhe: { httpStatus: resposta.status },
        },
      };
    }

    return { ok: true, wamid };
  }

  return {
    enviarTexto(para, texto, opcoes = {}) {
      return chamar({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizarDestinatario(para),
        type: "text",
        text: { preview_url: opcoes.previewUrl ?? false, body: texto },
      });
    },

    enviarTemplate(para, { nome, idioma = "pt_BR", componentes }) {
      return chamar({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizarDestinatario(para),
        type: "template",
        template: {
          name: nome,
          language: { code: idioma },
          components: componentes,
        },
      });
    },

    marcarComoLida(wamid) {
      return chamar(
        {
          messaging_product: "whatsapp",
          status: "read",
          message_id: wamid,
        },
        wamid,
      );
    },
  };
}
