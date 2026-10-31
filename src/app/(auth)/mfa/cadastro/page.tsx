import { redirect } from "next/navigation";
import { Smartphone } from "lucide-react";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterSessao } from "@/server/sessao";
import { exigeMfa } from "@/server/mfa";
import { sair } from "@/app/(auth)/login/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { classesBotao } from "@/components/ui/button";
import { TelaEntrada } from "@/components/dominio/TelaEntrada";
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
  const { data: fatores, error: erroFatores } = await supabase.auth.mfa.listFactors();
  const jaTemVerificado = (fatores?.totp ?? []).length > 0;
  if (erroFatores) {
    return (
      <TelaEntrada>
        <Card className="shadow-md">
          <CardHeader className="pt-7">
            <CardTitle className="text-xl">Não foi possível consultar seus autenticadores</CardTitle>
            <CardDescription>Sem essa resposta, cadastrar um autenticador novo poderia duplicar o que você já tem. Nada foi alterado.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pb-7">
            <Alert tom="perigo">{erroFatores.message}</Alert>
            <a href={`/mfa/cadastro?voltar=${encodeURIComponent(destino)}`} className={classesBotao({ variante: "contorno", className: "w-full" })}>
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

  return (
    <TelaEntrada>
      <Card className="shadow-md">
        <CardHeader className="pt-7">
          <span className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-marca-50 text-marca-600" aria-hidden>
            <Smartphone className="h-5 w-5" />
          </span>
          <CardTitle className="text-xl">{jaTemVerificado ? "Cadastrar outro autenticador" : "Cadastre o segundo fator"}</CardTitle>
          <CardDescription>
            Use um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy, 1Password…) para gerar códigos de 6 dígitos a cada 30 segundos.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pb-7">
          {obrigatorio && !jaTemVerificado ? (
            <Alert tom="alerta">Para sócios e advogados o segundo fator é obrigatório: processos, prazos e publicações só aparecem depois de confirmar o código.</Alert>
          ) : null}
          <CadastroTotp voltar={destino} email={user.email ?? ""} podeCancelar={!obrigatorio || jaTemVerificado} />
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
