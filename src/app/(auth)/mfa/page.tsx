import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { criarClienteServidor } from "@/lib/supabase/server";
import { sair } from "@/app/(auth)/login/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { classesBotao } from "@/components/ui/button";
import { TelaEntrada } from "@/components/dominio/TelaEntrada";
import { destinoSeguro } from "./destino";
import { FormularioDesafio } from "./formulario";

export const metadata = { title: "Segundo fator" };
export const dynamic = "force-dynamic";

/**
 * Desafio do segundo fator (TOTP). Fica fora do grupo (painel) para não entrar em laço com o layout,
 * que manda para cá quem é sócio/advogado com fator cadastrado e sessão aal1.
 */
export default async function PaginaMfa({ searchParams }: { searchParams: Promise<{ voltar?: string; erro?: string }> }) {
  const { voltar, erro } = await searchParams;
  const destino = destinoSeguro(voltar);
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?voltar=${encodeURIComponent(`/mfa?voltar=${destino}`)}`);

  const [fatores, nivel] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
  const falhaAuth = fatores.error?.message ?? nivel.error?.message ?? null;
  if (falhaAuth) {
    return (
      <TelaEntrada>
        <Card className="shadow-md">
          <CardHeader className="pt-7">
            <CardTitle className="text-xl">Não foi possível verificar o segundo fator</CardTitle>
            <CardDescription>O serviço de autenticação não respondeu. Nada foi alterado na sua conta.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pb-7">
            <Alert tom="perigo">{falhaAuth}</Alert>
            <a href={`/mfa?voltar=${encodeURIComponent(destino)}`} className={classesBotao({ variante: "contorno", className: "w-full" })}>
              Tentar de novo
            </a>
            <form action={sair} className="text-center">
              <button type="submit" className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline">
                Sair e entrar com outra conta
              </button>
            </form>
          </CardContent>
        </Card>
      </TelaEntrada>
    );
  }
  const totp = (fatores.data?.totp ?? []).map((f) => ({ id: f.id, nome: f.friendly_name ?? "Autenticador" }));
  if (totp.length === 0) redirect(`/mfa/cadastro?voltar=${encodeURIComponent(destino)}`);
  if (nivel.data?.currentLevel === "aal2") redirect(destino);

  return (
    <TelaEntrada>
      <Card className="shadow-md">
        <CardHeader className="pt-7">
          <span className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-marca-50 text-marca-600" aria-hidden>
            <ShieldCheck className="h-5 w-5" />
          </span>
          <CardTitle className="text-xl">Confirme o segundo fator</CardTitle>
          <CardDescription>
            Abra o aplicativo autenticador no celular e digite o código de 6 dígitos de <span className="font-semibold text-zinc-700">{user.email ?? "sua conta"}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pb-7">
          {erro ? <Alert tom="perigo">{erro}</Alert> : null}
          <FormularioDesafio fatores={totp} voltar={destino} />
          <form action={sair} className="text-center">
            <button type="submit" className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline">
              Sair e entrar com outra conta
            </button>
          </form>
        </CardContent>
      </Card>
    </TelaEntrada>
  );
}
