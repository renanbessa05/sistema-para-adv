import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { envServidor } from "@/lib/config/env";
import { obterSessao } from "@/server/sessao";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { TelaEntrada } from "@/components/dominio/TelaEntrada";
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
    <TelaEntrada>
      <Card className="shadow-md">
        <CardHeader className="pt-7">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Vamos criar o seu escritório</h1>
          <CardDescription>Três passos curtos. Você será o sócio responsável; os demais membros entram por convite.</CardDescription>
        </CardHeader>
        <CardContent className="pb-7">
          <FormularioOnboarding erro={erro} />
        </CardContent>
      </Card>
    </TelaEntrada>
  );
}
