import { criarLimitador, sleepPadrao, type Sleep } from "../djen/ritmo";
import { normalizarProcessoDatajud } from "./normalizar";
import { RespostaDatajudSchema, type ProcessoDatajud, type RespostaDatajud } from "./tipos";

/**
 * Cliente HTTP da API Pública do DataJud. Código puro, com `fetchImpl`, `sleep`
 * e `agora` injetáveis.
 *
 * Regras (docs/escopo-revisado.md, 1.3.3 e A.2):
 * - `POST {base}/{alias}/_search` com `Authorization: APIKey <chave>`;
 * - termos de uso: no máximo 120 requisições por minuto (padrão aqui: 100);
 * - 401/403: a chave pública foi trocada pelo CNJ ou está errada — sem retentativa;
 * - 429 e 5xx: retentativa com espera.
 */

export const DATAJUD_BASE_URL_PADRAO = "https://api-publica.datajud.cnj.jus.br";
export const DATAJUD_ALIAS_TJMT = "api_publica_tjmt";

export class ErroDatajud extends Error {
  readonly status: number | null;
  readonly corpo: string | null;
  readonly url: string | null;
  /** true em 401/403: a chave precisa ser atualizada na configuração. */
  readonly chaveInvalida: boolean;

  constructor(
    mensagem: string,
    opcoes: { status?: number | null; corpo?: string | null; url?: string | null; chaveInvalida?: boolean; causa?: unknown } = {},
  ) {
    super(mensagem, opcoes.causa !== undefined ? { cause: opcoes.causa } : undefined);
    this.name = "ErroDatajud";
    this.status = opcoes.status ?? null;
    this.corpo = opcoes.corpo ?? null;
    this.url = opcoes.url ?? null;
    this.chaveInvalida = opcoes.chaveInvalida ?? false;
  }
}

export interface OpcoesClienteDatajud {
  baseUrl?: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  sleep?: Sleep;
  agora?: () => number;
  /** Padrão 100, abaixo do limite de 120/min dos termos de uso. */
  maxRequisicoesPorMinuto?: number;
}

export interface OpcoesBusca {
  /** Alias do índice do tribunal. Padrão `api_publica_tjmt`. */
  tribunalAlias?: string;
  /** Tamanho da página (10 a 10.000). Padrão 10: um processo raramente tem mais de 2 ou 3 graus. */
  size?: number;
}

export interface ResultadoBuscaVarios {
  numero_cnj: string;
  /** null quando o DataJud não devolveu nada para o número. */
  processos: ProcessoDatajud[] | null;
  /** Mensagem de erro quando a consulta deste número falhou (as outras continuam). */
  erro: string | null;
}

export interface ClienteDatajud {
  /** Envia a consulta Elasticsearch bruta e devolve a resposta validada. */
  buscar(corpo: Record<string, unknown>, opcoes?: OpcoesBusca): Promise<RespostaDatajud>;
  /** Busca por `numeroProcesso` (20 dígitos). Devolve um `ProcessoDatajud` por grau, ou null se não houver hits. */
  buscarPorNumero(numeroCnj: string, opcoes?: OpcoesBusca): Promise<ProcessoDatajud[] | null>;
  /** Itera `buscarPorNumero` respeitando o ritmo. Erros de chave abortam; os demais ficam em `erro`. */
  buscarVarios(numeros: string[], opcoes?: OpcoesBusca): Promise<ResultadoBuscaVarios[]>;
}

const TENTATIVAS_429 = 3;
const ESPERA_429_MS = 60_000;
const TENTATIVAS_5XX = 3;
const ESPERA_5XX_BASE_MS = 1_000;

async function lerCorpo(resposta: Response): Promise<string> {
  try {
    const t = await resposta.text();
    return t.length > 2_000 ? `${t.slice(0, 2_000)}…` : t;
  } catch {
    return "";
  }
}

export function criarClienteDatajud(opcoes: OpcoesClienteDatajud): ClienteDatajud {
  if (!opcoes.apiKey || opcoes.apiKey.trim() === "") {
    throw new ErroDatajud("Chave da API do DataJud ausente (DATAJUD_API_KEY).", { chaveInvalida: true });
  }
  const baseUrl = (opcoes.baseUrl ?? DATAJUD_BASE_URL_PADRAO).replace(/\/+$/, "");
  const apiKey = opcoes.apiKey.trim();
  const fetchImpl = opcoes.fetchImpl ?? globalThis.fetch;
  const sleep = opcoes.sleep ?? sleepPadrao;
  const agora = opcoes.agora ?? (() => Date.now());
  const limitador = criarLimitador({ maxPorMinuto: opcoes.maxRequisicoesPorMinuto ?? 100, sleep, agora });

  async function postJson(url: string, corpo: unknown): Promise<unknown> {
    let repeticoes429 = 0;
    let tentativas5xx = 0;
    const body = JSON.stringify(corpo);

    for (;;) {
      await limitador.aguardarVaga();

      let resposta: Response;
      try {
        resposta = await fetchImpl(url, {
          method: "POST",
          headers: {
            Authorization: `APIKey ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body,
        });
      } catch (erro) {
        tentativas5xx += 1;
        if (tentativas5xx >= TENTATIVAS_5XX) {
          throw new ErroDatajud(`Falha de rede ao consultar o DataJud após ${tentativas5xx} tentativas.`, { url, causa: erro });
        }
        await sleep(ESPERA_5XX_BASE_MS * 2 ** (tentativas5xx - 1));
        continue;
      }

      if (resposta.status === 401 || resposta.status === 403) {
        throw new ErroDatajud(
          `DataJud devolveu ${resposta.status}: chave da API inválida ou trocada pelo CNJ. ` +
            "Pegue a chave pública atual em https://datajud-wiki.cnj.jus.br/api-publica/acesso/ e atualize DATAJUD_API_KEY.",
          { status: resposta.status, corpo: await lerCorpo(resposta), url, chaveInvalida: true },
        );
      }

      if (resposta.status === 429) {
        if (repeticoes429 >= TENTATIVAS_429) {
          throw new ErroDatajud(`DataJud devolveu 429 (limite de requisições) ${repeticoes429 + 1} vezes seguidas.`, {
            status: 429,
            corpo: await lerCorpo(resposta),
            url,
          });
        }
        repeticoes429 += 1;
        await sleep(ESPERA_429_MS);
        continue;
      }

      if (resposta.status >= 500) {
        tentativas5xx += 1;
        if (tentativas5xx >= TENTATIVAS_5XX) {
          throw new ErroDatajud(`DataJud devolveu ${resposta.status} após ${tentativas5xx} tentativas.`, {
            status: resposta.status,
            corpo: await lerCorpo(resposta),
            url,
          });
        }
        await sleep(ESPERA_5XX_BASE_MS * 2 ** (tentativas5xx - 1));
        continue;
      }

      if (!resposta.ok) {
        throw new ErroDatajud(`DataJud devolveu ${resposta.status}.`, { status: resposta.status, corpo: await lerCorpo(resposta), url });
      }

      const textoCorpo = await lerCorpo(resposta.clone());
      try {
        return await resposta.json();
      } catch (erro) {
        throw new ErroDatajud("DataJud devolveu corpo que não é JSON.", { status: resposta.status, corpo: textoCorpo, url, causa: erro });
      }
    }
  }

  async function buscar(corpo: Record<string, unknown>, opcoesBusca: OpcoesBusca = {}): Promise<RespostaDatajud> {
    const alias = (opcoesBusca.tribunalAlias ?? DATAJUD_ALIAS_TJMT).replace(/^\/+|\/+$/g, "");
    const url = `${baseUrl}/${alias}/_search`;
    const json = await postJson(url, corpo);
    const resultado = RespostaDatajudSchema.safeParse(json);
    if (!resultado.success) {
      throw new ErroDatajud("Resposta do DataJud fora do formato Elasticsearch esperado (hits.hits[]).", {
        status: 200,
        corpo: JSON.stringify(json).slice(0, 2_000),
        url,
        causa: resultado.error,
      });
    }
    return resultado.data;
  }

  async function buscarPorNumero(numeroCnj: string, opcoesBusca: OpcoesBusca = {}): Promise<ProcessoDatajud[] | null> {
    const digitos = numeroCnj.replace(/\D/g, "");
    if (digitos.length !== 20) {
      throw new ErroDatajud(`Número CNJ deve ter 20 dígitos (recebido "${numeroCnj}").`);
    }
    const size = Math.min(Math.max(opcoesBusca.size ?? 10, 10), 10_000);
    const resposta = await buscar(
      {
        size,
        query: { match: { numeroProcesso: digitos } },
      },
      opcoesBusca,
    );
    if (resposta.hits.hits.length === 0) return null;
    return resposta.hits.hits
      .map((hit) => normalizarProcessoDatajud(hit._source))
      // O `match` pode trazer vizinhos; ficamos só com o número exato.
      .filter((p) => p.numero_cnj === digitos)
      .sort((a, b) => (a.grau ?? "").localeCompare(b.grau ?? ""));
  }

  async function buscarVarios(numeros: string[], opcoesBusca: OpcoesBusca = {}): Promise<ResultadoBuscaVarios[]> {
    const resultados: ResultadoBuscaVarios[] = [];
    const vistos = new Set<string>();
    for (const numero of numeros) {
      const digitos = numero.replace(/\D/g, "");
      if (vistos.has(digitos)) continue;
      vistos.add(digitos);
      try {
        const processos = await buscarPorNumero(digitos, opcoesBusca);
        resultados.push({ numero_cnj: digitos, processos: processos && processos.length > 0 ? processos : null, erro: null });
      } catch (erro) {
        if (erro instanceof ErroDatajud && erro.chaveInvalida) throw erro;
        resultados.push({ numero_cnj: digitos, processos: null, erro: erro instanceof Error ? erro.message : String(erro) });
      }
    }
    return resultados;
  }

  return { buscar, buscarPorNumero, buscarVarios };
}
