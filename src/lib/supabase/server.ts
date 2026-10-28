import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { envPublico } from "@/lib/config/env";
import type { Database } from "./database.types";

/** Cliente Supabase para Server Components, Server Actions e Route Handlers (sessão do usuário via cookies). */
export async function criarClienteServidor() {
  const cookieStore = await cookies();
  return createServerClient<Database>(envPublico.NEXT_PUBLIC_SUPABASE_URL, envPublico.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Em Server Components a escrita de cookies é ignorada; o middleware renova a sessão.
        }
      },
    },
  });
}
