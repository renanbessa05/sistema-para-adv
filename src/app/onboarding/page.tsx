import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { envServidor } from "@/lib/config/env";
import { obterSessao } from "@/server/sessao";
import { FormularioOnboarding } from "./formulario";

export default async function PaginaOnboarding({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (envServidor().ONBOARDING_ATIVO !== "true") redirect("/sem-escritorio");
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (await obterSessao()) redirect("/hoje");
  const { erro } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="flex w-full flex-col items-center gap-4">
        <h1 className="text-xl font-semibold">Vamos criar o seu escritório</h1>
        <FormularioOnboarding erro={erro} />
      </div>
    </main>
  );
}
