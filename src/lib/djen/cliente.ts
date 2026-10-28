import { extrairDigitosCnj } from "./cnj-local";
import { criarLimitador, sleepPadrao, type Sleep } from "./ritmo";
import {
  RespostaDjenSchema,
  TribunalDjenSchema,
  type ItemDjen,
  type ParametrosConsultaDjen,
  type RespostaDjen,
  type TribunalDjen,
} from "./tipos";

/**
 * Cliente HTTP do DJEN (Comunica PJe). Código puro: recebe `fetchImpl`, `sleep`
 * e `agora` injetáveis e não conhece Next nem Supabase.
 *
 * Regras (docs/escopo-revisado.md, 1.3.3 e A.1):
 * - pelo menos um filtro entre siglaTribunal, texto, nomeParte, nomeAdvogado, numeroOab, numeroProcesso;
 * - limite por IP de ~20 requisições por minuto: o cliente se segura em `maxRequisicoesPorMinuto` (padrão 18);
 * - 429: esperar 60 s e repetir, no máximo 3 vezes;
 * - 5xx (e falha de rede): 3 tentativas com espera exponencial;
 * - teto de 10.000 resultados por consulta.
 */

export const DJEN_BASE_URL_PADRAO = "https://comunicaapi.pje.jus.br";

const FILTROS_OBRIGATORIOS: Array<keyof ParametrosConsultaDjen> = [
  "siglaTribunal",
  "texto",
  "nomeParte",
  "nomeAdvogado",
  "numeroOab",
  "numeroProcesso",
];

export class ErroDjen extends Error {
  /** Status HTTP da última resposta; null quando o erro não veio de uma resposta (rede, parâmetros). */
  readonly status: number | null;
  /** Corpo bruto da última resposta (truncado), para diagnóstico. */
  readonly corpo: string | null;
  readonly url: string | null;

  constructor(mensagem: string, opcoes: { status?: number | null; corpo?: string | null; url?: string | null; causa?: unknown } = {}) {
    super(mensagem, opcoes.causa !== undefined ? { cause: opcoes.causa } : undefined);
    this.name = "ErroDjen";
    this.status = opcoes.status ?? null;
    this.corpo = opcoes.corpo ?? null;
    this.url = opcoes.url ?? null;
  }
}

export interface RateLimitDjen {
  /** Valor de `x-ratelimit-limit`, se o servidor enviou. */
  limite: number | null;
  /** Valor de `x-ratelimit-remaining`, se o servidor enviou. */
  restante: number | null;
  /** Valor de `x-ratelimit-reset`, bruto, se existir (a confirmar na API real). */
  reset: string | null;
  /** ISO 8601 do momento em que os cabeçalhos foram lidos. */
  lidoEm: string;
}

export interface OpcoesClienteDjen {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: Sleep;
  /** Relógio injetável (ms). Padrão `Date.now`. */
  agora?: () => number;
  /** Padrão 18, abaixo do limite medido de ~20 por minuto. */
  maxRequisicoesPorMinuto?: number;
}

export interface ResultadoConsultaTodas {
  items: ItemDjen[];
  /** `count` informado pela API na primeira página (null se a API não informar). */
  count: number | null;
  paginas: number;
  /** true quando parou por `maxItens` antes de esgotar o `count`. */
  truncado: boolean;
}

export interface ClienteDjen {
  consultar(params: ParametrosConsultaDjen): Promise<RespostaDjen>;
  consultarTodas(params: ParametrosConsultaDjen, opcoes?: { maxItens?: number }): Promise<ResultadoConsultaTodas>;
  tribunais(): Promise<TribunalDjen[]>;
  certidaoUrl(hash: string): string;
  /** Últimos cabeçalhos `x-ratelimit-*` recebidos, ou null se nunca vieram. */
  readonly ultimoRateLimit: RateLimitDjen | null;
}

const TENTATIVAS_429 = 3;
const ESPERA_429_MS = 60_000;
const TENTATIVAS_5XX = 3;
const ESPERA_5XX_BASE_MS = 1_000;
const TETO_RESULTADOS_API = 10_000;

function montarQuery(params: ParametrosConsultaDjen): URLSearchParams {
  const q = new URLSearchParams();
  const por = (chave: string, valor: string | number | undefined) => {
    if (valor === undefined || valor === null || valor === "") return;
    q.set(chave, String(valor));
  };
  por("numeroOab", params.numeroOab);
  por("ufOab", params.ufOab?.toUpperCase());
  por("nomeAdvogado", params.nomeAdvogado);
  por("nomeParte", params.nomeParte);
  if (params.numeroProcesso) {
    // A API espera 20 dígitos sem máscara (a confirmar na API real se também aceita com máscara).
    por("numeroProcesso", extrairDigitosCnj(params.numeroProcesso) ?? params.numeroProcesso.replace(/\D/g, ""));
  }
  por("texto", params.texto);
  por("siglaTribunal", params.siglaTribunal?.toUpperCase());
  por("dataDisponibilizacaoInicio", params.dataDisponibilizacaoInicio);
  por("dataDisponibilizacaoFim", params.dataDisponibilizacaoFim);
  por("meio", params.meio);
  por("itensPorPagina", params.itensPorPagina ?? 100);
  por("pagina", params.pagina ?? 1);
  return q;
}

function validarParametros(params: ParametrosConsultaDjen): void {
  const temFiltro = FILTROS_OBRIGATORIOS.some((chave) => {
    const v = params[chave];
    return v !== undefined && v !== null && String(v).trim() !== "";
  });
  if (!temFiltro) {
    throw new ErroDjen(
      `A consulta ao DJEN exige ao menos um filtro entre: ${FILTROS_OBRIGATORIOS.join(", ")}.`,
    );
  }
  if (params.itensPorPagina !== undefined && params.itensPorPagina !== 5 && params.itensPorPagina !== 100) {
    throw new ErroDjen("itensPorPagina deve ser 5 ou 100 (regra do Swagger do DJEN).");
  }
  for (const chave of ["dataDisponibilizacaoInicio", "dataDisponibilizacaoFim"] as const) {
    const v = params[chave];
    if (v !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      throw new ErroDjen(`${chave} deve estar no formato YYYY-MM-DD (recebido: "${v}").`);
    }
  }
  if (params.pagina !== undefined && (!Number.isInteger(params.pagina) || params.pagina < 1)) {
    throw new ErroDjen("pagina deve ser um inteiro a partir de 1.");
  }
}

function lerInteiro(valor: string | null): number | null {
  if (valor === null) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

async function lerCorpo(resposta: Response): Promise<string> {
  try {
    const texto = await resposta.text();
    return texto.length > 2_000 ? `${texto.slice(0, 2_000)}…` : texto;
  } catch {
    return "";
  }
}

export function criarClienteDjen(opcoes: OpcoesClienteDjen = {}): ClienteDjen {
  const baseUrl = (opcoes.baseUrl ?? DJEN_BASE_URL_PADRAO).replace(/\/+$/, "");
  const fetchImpl = opcoes.fetchImpl ?? globalThis.fetch;
  const sleep = opcoes.sleep ?? sleepPadrao;
  const agora = opcoes.agora ?? (() => Date.now());
  const limitador = criarLimitador({
    maxPorMinuto: opcoes.maxRequisicoesPorMinuto ?? 18,
    sleep,
    agora,
  });

  let ultimoRateLimit: RateLimitDjen | null = null;

  function registrarRateLimit(headers: Headers): void {
    const limite = headers.get("x-ratelimit-limit");
    const restante = headers.get("x-ratelimit-remaining");
    const reset = headers.get("x-ratelimit-reset");
    if (limite === null && restante === null && reset === null) return;
    ultimoRateLimit = {
      limite: lerInteiro(limite),
      restante: lerInteiro(restante),
      reset,
      lidoEm: new Date(agora()).toISOString(),
    };
  }

  /**
   * GET com controle de ritmo e retentativas. Devolve o JSON já parseado (unknown).
   * 429: espera 60 s, até 3 repetições. 5xx/rede: até 3 tentativas (1 s, 2 s).
   */
  async function obterJson(url: string): Promise<unknown> {
    let repeticoes429 = 0;
    let tentativas5xx = 0;

    for (;;) {
      await limitador.aguardarVaga();

      let resposta: Response;
      try {
        resposta = await fetchImpl(url, { headers: { accept: "application/json" } });
      } catch (erro) {
        tentativas5xx += 1;
        if (tentativas5xx >= TENTATIVAS_5XX) {
          throw new ErroDjen(`Falha de rede ao consultar o DJEN após ${tentativas5xx} tentativas.`, { url, causa: erro });
        }
        await sleep(ESPERA_5XX_BASE_MS * 2 ** (tentativas5xx - 1));
        continue;
      }

      registrarRateLimit(resposta.headers);

      if (resposta.status === 429) {
        if (repeticoes429 >= TENTATIVAS_429) {
          throw new ErroDjen(`DJEN devolveu 429 (limite de requisições) ${repeticoes429 + 1} vezes seguidas.`, {
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
          throw new ErroDjen(`DJEN devolveu ${resposta.status} após ${tentativas5xx} tentativas.`, {
            status: resposta.status,
            corpo: await lerCorpo(resposta),
            url,
          });
        }
        await sleep(ESPERA_5XX_BASE_MS * 2 ** (tentativas5xx - 1));
        continue;
      }

      if (!resposta.ok) {
        throw new ErroDjen(`DJEN devolveu ${resposta.status}.`, {
          status: resposta.status,
          corpo: await lerCorpo(resposta),
          url,
        });
      }

      const corpo = await lerCorpo(resposta.clone());
      try {
        return await resposta.json();
      } catch (erro) {
        throw new ErroDjen("DJEN devolveu corpo que não é JSON.", { status: resposta.status, corpo, url, causa: erro });
      }
    }
  }

  async function consultar(params: ParametrosConsultaDjen): Promise<RespostaDjen> {
    validarParametros(params);
    const url = `${baseUrl}/api/v1/comunicacao?${montarQuery(params).toString()}`;
    const json = await obterJson(url);
    const resultado = RespostaDjenSchema.safeParse(json);
    if (!resultado.success) {
      throw new ErroDjen("Resposta do DJEN fora do formato esperado (envelope {status, message, count, items[]}).", {
        status: 200,
        corpo: JSON.stringify(json).slice(0, 2_000),
        url,
        causa: resultado.error,
      });
    }
    return resultado.data;
  }

  async function consultarTodas(
    params: ParametrosConsultaDjen,
    opcoes: { maxItens?: number } = {},
  ): Promise<ResultadoConsultaTodas> {
    const maxItens = Math.min(opcoes.maxItens ?? TETO_RESULTADOS_API, TETO_RESULTADOS_API);
    const itensPorPagina = params.itensPorPagina ?? 100;
    const items: ItemDjen[] = [];
    let pagina = params.pagina ?? 1;
    let count: number | null = null;
    let paginas = 0;
    let truncado = false;

    for (;;) {
      const resposta = await consultar({ ...params, itensPorPagina, pagina });
      paginas += 1;
      if (count === null && typeof resposta.count === "number") count = resposta.count;

      for (const item of resposta.items) {
        if (items.length >= maxItens) {
          truncado = true;
          break;
        }
        items.push(item);
      }
      if (truncado) break;

      // Para quando: a página veio vazia; o `count` foi atingido; ou, sem `count`,
      // a página veio incompleta (proteção contra laço infinito).
      const esgotou =
        resposta.items.length === 0 ||
        (count !== null && items.length >= count) ||
        (count === null && resposta.items.length < itensPorPagina);
      if (esgotou) break;
      if (items.length >= maxItens) {
        // Ainda há páginas (count maior), mas atingimos o teto pedido.
        truncado = count === null || items.length < count;
        break;
      }
      pagina += 1;
    }

    return { items, count, paginas, truncado };
  }

  async function tribunais(): Promise<TribunalDjen[]> {
    const url = `${baseUrl}/api/v1/comunicacao/tribunal`;
    const json = await obterJson(url);
    // O Swagger lista o endpoint, mas o formato exato do corpo (lista direta ou envelope com `items`)
    // fica (a confirmar na API real); aceitamos os dois.
    const lista = Array.isArray(json)
      ? json
      : json && typeof json === "object" && Array.isArray((json as { items?: unknown }).items)
        ? (json as { items: unknown[] }).items
        : null;
    if (!lista) {
      throw new ErroDjen("Resposta de /api/v1/comunicacao/tribunal fora do formato esperado.", {
        status: 200,
        corpo: JSON.stringify(json).slice(0, 2_000),
        url,
      });
    }
    return lista.map((t) => TribunalDjenSchema.parse(t));
  }

  function certidaoUrl(hash: string): string {
    return `${baseUrl}/api/v1/comunicacao/${encodeURIComponent(hash)}/certidao`;
  }

  return {
    consultar,
    consultarTodas,
    tribunais,
    certidaoUrl,
    get ultimoRateLimit() {
      return ultimoRateLimit;
    },
  };
}
