import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { sair } from "@/app/(auth)/login/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatarDataHora } from "@/lib/utils";
import { aceitarConvite } from "./actions";

export const metadata = { title: "Aceitar convite" };
export const dynamic = "force-dynamic";

const PAPEIS: Record<string, string> = { socio: "Sócio(a)", advogado: "Advogado(a)", estagiario: "Estagiário(a)", administrativo: "Administrativo" };

type Convite = { escritorio_id: string; escritorio_nome: string; papel: string; convidado_em: string };

/**
 * Convites pendentes do usuário logado (RPC convites_pendentes). Fica fora do painel: quem chega aqui pode não ter
 * escritório nenhum ainda, ou pertencer a outro. Aceitar troca o escritório da sessão (um vínculo ativo por vez no MVP).
 */
export default async function PaginaAceitarConvite({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?voltar=${encodeURIComponent("/convite/aceitar")}`);

  const { data, error } = await supabase.rpc("convites_pendentes");
  const convites = (data ?? []) as Convite[];

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-900">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Convites pendentes</CardTitle>
          <CardDescription>Conta {user.email ?? ""}. Um convite só vale depois que você aceita; ao aceitar, este passa a ser o escritório da sua sessão.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {erro ? <Alert tom="perigo">{erro}</Alert> : null}
          {error ? <Alert tom="perigo">Não foi possível consultar os convites: {error.message}</Alert> : null}
          {!error && convites.length === 0 ? <p className="text-sm text-zinc-500">Nenhum convite pendente para esta conta.</p> : null}
          {convites.map((c) => (
            <form key={c.escritorio_id} action={aceitarConvite} className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <div>
                <p className="font-medium">{c.escritorio_nome}</p>
                <p className="text-xs text-zinc-500">
                  Como {PAPEIS[c.papel] ?? c.papel} · convite de {formatarDataHora(c.convidado_em)}
                </p>
              </div>
              <input type="hidden" name="escritorio_id" value={c.escritorio_id} />
              <Button type="submit" tamanho="sm">
                Aceitar
              </Button>
            </form>
          ))}
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <a href="/hoje" className="underline-offset-2 hover:underline">
              Ir para o painel
            </a>
            <form action={sair}>
              <button type="submit" className="underline-offset-2 hover:underline">
                Sair
              </button>
            </form>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
