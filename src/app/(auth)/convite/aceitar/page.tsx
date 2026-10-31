import { redirect } from "next/navigation";
import { Building2, MailOpen } from "lucide-react";
import { criarClienteServidor } from "@/lib/supabase/server";
import { sair } from "@/app/(auth)/login/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TelaEntrada } from "@/components/dominio/TelaEntrada";
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
    <TelaEntrada>
      <Card className="shadow-md">
        <CardHeader className="pt-7">
          <span className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-marca-50 text-marca-600" aria-hidden>
            <MailOpen className="h-5 w-5" />
          </span>
          <CardTitle className="text-xl">Convites pendentes</CardTitle>
          <CardDescription>
            Conta <span className="font-semibold text-zinc-700">{user.email ?? ""}</span>. Um convite só vale depois que você aceita; ao aceitar, este passa a ser o escritório da sua sessão.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pb-7">
          {erro ? <Alert tom="perigo">{erro}</Alert> : null}
          {error ? <Alert tom="perigo">Não foi possível consultar os convites: {error.message}</Alert> : null}
          {!error && convites.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 px-4 py-6 text-center">
              <p className="text-sm text-zinc-500">Nenhum convite pendente para esta conta.</p>
            </div>
          ) : null}
          {convites.length ? (
            <ul className="flex flex-col gap-2">
              {convites.map((c) => (
                <li key={c.escritorio_id}>
                  <form action={aceitarConvite} className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm shadow-xs">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-600" aria-hidden>
                      <Building2 className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-zinc-950">{c.escritorio_nome}</p>
                      <p className="text-xs text-zinc-500 tabular-nums">
                        Como {PAPEIS[c.papel] ?? c.papel} · convite de {formatarDataHora(c.convidado_em)}
                      </p>
                    </div>
                    <input type="hidden" name="escritorio_id" value={c.escritorio_id} />
                    <Button type="submit" tamanho="sm" className="w-full sm:w-auto">
                      Aceitar
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-center justify-between border-t border-zinc-100 pt-4 text-xs font-medium text-zinc-500">
            <a href="/hoje" className="underline-offset-2 hover:text-zinc-900 hover:underline">
              Ir para o painel
            </a>
            <form action={sair}>
              <button type="submit" className="underline-offset-2 hover:text-zinc-900 hover:underline">
                Sair
              </button>
            </form>
          </div>
        </CardContent>
      </Card>
    </TelaEntrada>
  );
}
