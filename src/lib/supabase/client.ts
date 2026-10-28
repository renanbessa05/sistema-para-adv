"use client";

import { createBrowserClient } from "@supabase/ssr";
import { envPublico } from "@/lib/config/env";
import type { Database } from "./database.types";

/** Cliente Supabase para componentes de browser (respeita RLS do usuário logado). */
export function criarClienteBrowser() {
  return createBrowserClient<Database>(envPublico.NEXT_PUBLIC_SUPABASE_URL, envPublico.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
