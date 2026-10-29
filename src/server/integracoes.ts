import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteDatajud, type ClienteDatajud } from "@/lib/datajud";
import { criarClienteWhatsapp, type ClienteWhatsapp } from "@/lib/whatsapp";
import { DEFINICOES_INTEGRACAO, escolherSegredo, mensagemSemSegredo, type SegredoEscolhido, type TipoIntegracaoComSegredo } from "@/lib/integracoes";
import { envServidor } from "@/lib/config/env";

/**
 * Segredos de integração por escritório (migration 0017).
 * O valor vem do Vault pela RPC `segredo_integracao` (só service role); se não houver, a variável de
 * ambiente da Vercel segue valendo como fallback. A regra de escolha é pura (src/lib/integracoes).
 */

type Ambiente = ReturnType<typeof envServidor>;

function valorDoAmbiente(env: Ambiente, chave: string): string | undefined {
  const v = (env as unknown as Record<string, unknown>)[chave];
  return typeof v === "string" ? v : undefined;
}

export async function obterSegredo(admin: SupabaseClient, escritorioId: string, tipo: TipoIntegracaoComSegredo): Promise<SegredoEscolhido> {
  const env = envServidor();
  const def = DEFINICOES_INTEGRACAO[tipo];
  const [vault, linha] = await Promise.all([
    admin.rpc("segredo_integracao", { p_escritorio: escritorioId, p_tipo: tipo }),
    admin.from("integracoes").select("config").eq("escritorio_id", escritorioId).eq("tipo", tipo).maybeSingle(),
  ]);
  if (vault.error) {
    // Banco sem a RPC (migration ainda não aplicada) não derruba o job: vale o fallback do ambiente.
    console.warn(`[integracoes] segredo_integracao(${tipo}) falhou: ${vault.error.message}`);
  }
  const configAmbiente: Record<string, string | undefined> = {};
  for (const [chave, variavel] of Object.entries(def.variaveisConfig)) configAmbiente[chave] = valorDoAmbiente(env, variavel);
  return escolherSegredo({
    vault: vault.error ? null : (vault.data as string | null),
    ambiente: valorDoAmbiente(env, def.variavelSegredo),
    configBanco: (linha.data?.config as Record<string, unknown> | null | undefined) ?? null,
    configAmbiente,
  });
}

/** Grava `ultimo_erro` e status 'erro' na integração do escritório (ex.: DataJud recusou a chave). */
export async function registrarErroIntegracao(admin: SupabaseClient, escritorioId: string, tipo: TipoIntegracaoComSegredo, erro: string): Promise<void> {
  const { error } = await admin.rpc("integracao_registrar_erro", { p_escritorio: escritorioId, p_tipo: tipo, p_erro: erro });
  if (error) console.warn(`[integracoes] integracao_registrar_erro(${tipo}) falhou: ${error.message}`);
}

/** Cliente do WhatsApp do escritório, ou null quando falta token ou phone_number_id. */
export async function clienteWhatsappDoEscritorio(admin: SupabaseClient, escritorioId: string): Promise<ClienteWhatsapp | null> {
  const seg = await obterSegredo(admin, escritorioId, "whatsapp");
  if (!seg.valor || !seg.config.phone_number_id) return null;
  return criarClienteWhatsapp({ accessToken: seg.valor, phoneNumberId: seg.config.phone_number_id });
}

/** Cliente do WhatsApp só pelo ambiente (número ainda sem escritório conhecido, ex.: telefone não cadastrado). */
export function clienteWhatsappDoAmbiente(): ClienteWhatsapp | null {
  const env = envServidor();
  const seg = escolherSegredo({ vault: null, ambiente: env.WHATSAPP_ACCESS_TOKEN, configAmbiente: { phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID } });
  if (!seg.valor || !seg.config.phone_number_id) return null;
  return criarClienteWhatsapp({ accessToken: seg.valor, phoneNumberId: seg.config.phone_number_id });
}

/** Limpa `ultimo_erro` e volta a 'ativa' quando a integração voltou a funcionar (só muda linhas em 'erro'). */
export async function registrarSucessoIntegracao(admin: SupabaseClient, escritorioId: string, tipo: TipoIntegracaoComSegredo): Promise<void> {
  const { error } = await admin.rpc("integracao_registrar_sucesso", { p_escritorio: escritorioId, p_tipo: tipo });
  if (error) console.warn(`[integracoes] integracao_registrar_sucesso(${tipo}) falhou: ${error.message}`);
}

/**
 * Cliente do DataJud do escritório; sem segredo devolve o motivo legível para o registro do job.
 * `cache` (chave → cliente) faz escritórios com a mesma chave pública do CNJ dividirem o mesmo limitador de
 * requisições dentro de uma execução, em vez de cada um zerar o ritmo (120 req/min valem por chave).
 */
export async function clienteDatajudDoEscritorio(
  admin: SupabaseClient,
  escritorioId: string,
  cache?: Map<string, ClienteDatajud>,
): Promise<{ cliente: ClienteDatajud; origem: "vault" | "ambiente" } | { cliente: null; motivo: string }> {
  const seg = await obterSegredo(admin, escritorioId, "datajud");
  if (!seg.valor || !seg.origem) return { cliente: null, motivo: mensagemSemSegredo("datajud") };
  const existente = cache?.get(seg.valor);
  if (existente) return { cliente: existente, origem: seg.origem };
  const cliente = criarClienteDatajud({ baseUrl: envServidor().DATAJUD_BASE_URL, apiKey: seg.valor });
  cache?.set(seg.valor, cliente);
  return { cliente, origem: seg.origem };
}
