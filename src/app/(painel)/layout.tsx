import Link from "next/link";
import { redirect } from "next/navigation";
import { obterSessao } from "@/server/sessao";
import { sair } from "@/app/(auth)/login/actions";
import { Badge } from "@/components/ui/badge";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirMfaSeNecessario } from "@/server/mfa";
import { SeletorEscritorio } from "./seletor-escritorio";
import { gruposDoMenu } from "./menu";
import { MenuHorizontal, MenuLateral } from "./menu-lateral";

const PAPEIS: Record<string, string> = { socio: "Sócio(a)", advogado: "Advogado(a)", estagiario: "Estagiário(a)", administrativo: "Administrativo", suporte: "Suporte (leitura)" };

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/sem-escritorio");
  await exigirMfaSeNecessario(sessao);
  const supabase = await criarClienteServidor();
  const { count } = await supabase.from("notificacoes").select("id", { count: "exact", head: true }).eq("destinatario_id", sessao.usuarioId).eq("canal", "painel").in("status", ["enviada", "entregue"]).is("lida_em", null);
  const naoLidas = count ?? 0;
  const grupos = gruposDoMenu(sessao.papel);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto bg-marca-900 px-3 py-5 md:flex">
        <Link href="/hoje" className="mb-6 px-3">
          <p className="text-sm font-semibold tracking-wide text-white">Costa Abdo Advocacia</p>
          <p className="mt-0.5 text-xs text-ouro-500">Assistente Jurídica</p>
        </Link>
        <MenuLateral grupos={grupos} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
          <div className="flex items-center gap-3 px-4 py-2.5 md:px-8">
            <Link href="/hoje" className="text-sm font-semibold text-marca-600 md:hidden">
              Assistente Jurídica
            </Link>
            <div className="ml-auto flex items-center gap-3 text-sm">
              <SeletorEscritorio vinculos={sessao.vinculos} atual={sessao.escritorioId} />
              <Link href="/notificacoes" className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100" aria-label={naoLidas ? `Notificações: ${naoLidas} não lidas` : "Notificações"}>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {naoLidas ? <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">{naoLidas}</span> : null}
              </Link>
              <div className="hidden text-right sm:block">
                <p className="leading-tight font-medium text-zinc-900">{sessao.nome}</p>
                <Badge tom="contorno" className="mt-0.5">
                  {PAPEIS[sessao.papel] ?? sessao.papel}
                </Badge>
              </div>
              <form action={sair}>
                <button type="submit" className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
                  Sair
                </button>
              </form>
            </div>
          </div>
          <div className="border-t border-zinc-100 md:hidden">
            <MenuHorizontal grupos={grupos} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
