import "server-only";
import { createClient } from "@supabase/supabase-js";
import { envPublico, exigir } from "@/lib/config/env";
import type { Database } from "./database.types";

/**
 * Cliente com service role: ignora RLS.
 * Só para jobs e rotinas. Todo uso precisa filtrar e gravar `escritorio_id` explicitamente.
 */
export function criarClienteAdmin() {
  return createClient<Database>(envPublico.NEXT_PUBLIC_SUPABASE_URL, exigir("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
