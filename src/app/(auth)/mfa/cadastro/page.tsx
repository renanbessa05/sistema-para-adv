import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterSessao } from "@/server/sessao";
import { exigeMfa } from "@/server/mfa";
import { sair } from "@/app/(auth)/login/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { destinoSeguro } from "../destino";
import { CadastroTotp } from "./cadastro-totp";

export const metadata = { title: "Cadastrar autenticador" };
export const dynamic = "force-dynamic";

/**
 * Cadastro do primeiro (ou de mais um) fator TOTP. Fora do grupo (painel): o layout manda para cá
 * sócio/advogado sem fator verificado, e o banco libera a leitura do necessário enquanto não há fator (carência).
 */
export default async function PaginaCadastroMfa({ searchParams }: { searchParams: Promise<{ voltar?: string }> }) {
  const { voltar } = await searchParams;
  const destino = destinoSeguro(voltar);
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?voltar=${encodeURIComponent(`/mfa/cadastro?voltar=${destino}`)}`);

  const sessao = await obterSessao();
  const obrigatorio = sessao ? exigeMfa(sessao.papel) : false;
  const { data: fatores } = await supabase.auth.mfa.listFactors();
  const jaTemVerificado = (fatores?.totp ?? []).length > 0;

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-900">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{jaTemVerificado ? "Cadastrar outro autenticador" : "Cadastre o segundo fator"}</CardTitle>
          <CardDescription>
            Use um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy, 1Password…) para gerar códigos de 6 dígitos a cada 30 segundos.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {obrigatorio && !jaTemVerificado ? (
            <Alert tom="alerta">Para sócios e advogados o segundo fator é obrigatório: processos, prazos e publicações só aparecem depois de confirmar o código.</Alert>
          ) : null}
          <CadastroTotp voltar={destino} email={user.email ?? ""} podeCancelar={!obrigatorio || jaTemVerificado} />
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
