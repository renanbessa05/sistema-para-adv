/**
 * Regra pura de escolha do segredo de uma integração (WhatsApp, DataJud).
 *
 * Ordem: o valor gravado no Vault pela tela de Integrações vence; na falta dele vale a variável de
 * ambiente da Vercel (fallback de transição, docs/deploy.md); sem nenhum dos dois, `valor` é null.
 * A config não sensível (ex.: `phone_number_id`) segue a mesma ordem, chave a chave.
 * Código puro: não lê `process.env` nem o banco; recebe os valores e devolve a decisão.
 */

export const TIPOS_INTEGRACAO_COM_SEGREDO = ["whatsapp", "datajud"] as const;
export type TipoIntegracaoComSegredo = (typeof TIPOS_INTEGRACAO_COM_SEGREDO)[number];

export type OrigemSegredo = "vault" | "ambiente" | null;

export interface DefinicaoIntegracao {
  rotulo: string;
  /** Variável de ambiente que ainda serve de fallback para o segredo. */
  variavelSegredo: string;
  /** Chaves de config não sensível → variável de ambiente de fallback. */
  variaveisConfig: Record<string, string>;
  rotuloSegredo: string;
  rotulosConfig: Record<string, string>;
}

export const DEFINICOES_INTEGRACAO: Record<TipoIntegracaoComSegredo, DefinicaoIntegracao> = {
  whatsapp: {
    rotulo: "WhatsApp Cloud API (Meta)",
    variavelSegredo: "WHATSAPP_ACCESS_TOKEN",
    variaveisConfig: { phone_number_id: "WHATSAPP_PHONE_NUMBER_ID" },
    rotuloSegredo: "Token de acesso permanente (System User)",
    rotulosConfig: { phone_number_id: "Phone number ID (não é o número de telefone)" },
  },
  datajud: {
    rotulo: "DataJud (API Pública do CNJ)",
    variavelSegredo: "DATAJUD_API_KEY",
    variaveisConfig: {},
    rotuloSegredo: "Chave pública da API (wiki do CNJ)",
    rotulosConfig: {},
  },
};

export interface EntradaEscolhaSegredo {
  /** Valor lido do Vault (null quando não há segredo gravado ou o Vault não existe). */
  vault: string | null | undefined;
  /** Valor da variável de ambiente correspondente. */
  ambiente: string | null | undefined;
  /** `integracoes.config` do escritório. */
  configBanco?: Record<string, unknown> | null;
  /** Valores das variáveis de ambiente de fallback para cada chave de config. */
  configAmbiente?: Record<string, string | null | undefined>;
}

export interface SegredoEscolhido {
  valor: string | null;
  origem: OrigemSegredo;
  /** Config não sensível já resolvida (banco primeiro, depois ambiente); só chaves com valor. */
  config: Record<string, string>;
}

function limpo(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** Escolhe o segredo e a config de uma integração. Vault vence; variável de ambiente é fallback. */
export function escolherSegredo(entrada: EntradaEscolhaSegredo): SegredoEscolhido {
  const doVault = limpo(entrada.vault);
  const doAmbiente = limpo(entrada.ambiente);
  const config: Record<string, string> = {};
  const chaves = new Set<string>([...Object.keys(entrada.configBanco ?? {}), ...Object.keys(entrada.configAmbiente ?? {})]);
  for (const chave of chaves) {
    const v = limpo(entrada.configBanco?.[chave]) ?? limpo(entrada.configAmbiente?.[chave]);
    if (v !== null) config[chave] = v;
  }
  if (doVault !== null) return { valor: doVault, origem: "vault", config };
  if (doAmbiente !== null) return { valor: doAmbiente, origem: "ambiente", config };
  return { valor: null, origem: null, config };
}

/** Origem a exibir na tela sem precisar ler o valor: há referência no Vault? há variável de ambiente? */
export function origemDoSegredo({ temVault, temAmbiente }: { temVault: boolean; temAmbiente: boolean }): OrigemSegredo {
  if (temVault) return "vault";
  if (temAmbiente) return "ambiente";
  return null;
}

export function rotuloOrigem(origem: OrigemSegredo): string {
  if (origem === "vault") return "Vault";
  if (origem === "ambiente") return "variável de ambiente";
  return "nenhum";
}

/** Mensagem única para jobs e tela quando a integração não tem segredo em lugar nenhum. */
export function mensagemSemSegredo(tipo: TipoIntegracaoComSegredo): string {
  const d = DEFINICOES_INTEGRACAO[tipo];
  return `${d.rotulo}: segredo não configurado. Cadastre em Configurações → Integrações ou defina ${d.variavelSegredo} no ambiente.`;
}
