import { z } from "zod";

/**
 * Variáveis de ambiente validadas uma única vez.
 * `publico` pode ir ao browser; `servidor` nunca.
 * Em build (SKIP_ENV_VALIDATION=1) os valores ausentes não derrubam o processo.
 */

const publicoSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default("http://localhost:54321"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).default("anon"),
});

const servidorSchema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_TIMEZONE_PADRAO: z.string().default("America/Cuiaba"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  IA_MODELO_TRIAGEM: z.string().default("claude-haiku-5-5"),
  IA_MODELO_RESUMO: z.string().default("claude-haiku-5-5"),
  IA_MODELO_PECAS: z.string().default("claude-sonnet-5-5"),
  IA_MODELO_PECAS_FORTE: z.string().default("claude-opus-5-5"),
  IA_TETO_MENSAL_USD: z.coerce.number().positive().default(50),
  DJEN_BASE_URL: z.string().url().default("https://comunicaapi.pje.jus.br"),
  DATAJUD_BASE_URL: z.string().url().default("https://api-publica.datajud.cnj.jus.br"),
  DATAJUD_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_REMETENTE: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
});

function ler<T extends z.ZodTypeAny>(schema: T, origem: Record<string, string | undefined>): z.infer<T> {
  const resultado = schema.safeParse(origem);
  if (resultado.success) return resultado.data;
  if (process.env.SKIP_ENV_VALIDATION === "1") {
    return schema.parse({});
  }
  const problemas = resultado.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Variáveis de ambiente inválidas: ${problemas}`);
}

export const envPublico = ler(publicoSchema, {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

let cacheServidor: z.infer<typeof servidorSchema> | undefined;

/** Só pode ser chamado em código de servidor (rotas, server actions, jobs). */
export function envServidor(): z.infer<typeof servidorSchema> {
  if (typeof window !== "undefined") {
    throw new Error("envServidor() não pode ser usado no browser");
  }
  if (!cacheServidor) cacheServidor = ler(servidorSchema, process.env);
  return cacheServidor;
}

/** Exige uma variável opcional em tempo de execução, com mensagem clara. */
export function exigir<K extends keyof z.infer<typeof servidorSchema>>(chave: K): NonNullable<z.infer<typeof servidorSchema>[K]> {
  const valor = envServidor()[chave];
  if (valor === undefined || valor === null || valor === "") {
    throw new Error(`Variável de ambiente obrigatória ausente: ${String(chave)}`);
  }
  return valor as NonNullable<z.infer<typeof servidorSchema>[K]>;
}
