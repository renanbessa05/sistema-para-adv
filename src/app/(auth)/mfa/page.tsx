import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { sair } from "@/app/(auth)/login/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
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
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-900">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Não foi possível verificar o segundo fator</CardTitle>
            <CardDescription>O serviço de autenticação não respondeu. Nada foi alterado na sua conta.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Alert tom="perigo">{falhaAuth}</Alert>
            <a href={`/mfa?voltar=${encodeURIComponent(destino)}`} className="text-sm underline">
              Tentar de novo
            </a>
            <form action={sair} className="text-center">
              <button type="submit" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
                Sair e entrar com outra conta
              </button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }
  const totp = (fatores.data?.totp ?? []).map((f) => ({ id: f.id, nome: f.friendly_name ?? "Autenticador" }));
  if (totp.length === 0) redirect(`/mfa/cadastro?voltar=${encodeURIComponent(destino)}`);
  if (nivel.data?.currentLevel === "aal2") redirect(destino);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-900">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Confirme o segundo fator</CardTitle>
          <CardDescription>Abra o aplicativo autenticador no celular e digite o código de 6 dígitos de {user.email ?? "sua conta"}.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {erro ? <Alert tom="perigo">{erro}</Alert> : null}
          <FormularioDesafio fatores={totp} voltar={destino} />
          <form action={sair} className="text-center">
            <button type="submit" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
              Sair e entrar com outra conta
            </button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
