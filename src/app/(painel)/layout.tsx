import Link from "next/link";
import { redirect } from "next/navigation";
import { obterSessao } from "@/server/sessao";
import { sair } from "@/app/(auth)/login/actions";
import { Badge } from "@/components/ui/badge";

const ITENS = [
  { href: "/hoje", rotulo: "Hoje" },
  { href: "/publicacoes", rotulo: "Publicações" },
  { href: "/prazos", rotulo: "Prazos" },
  { href: "/tarefas", rotulo: "Tarefas" },
  { href: "/processos", rotulo: "Processos" },
  { href: "/clientes", rotulo: "Clientes" },
  { href: "/aprovacoes", rotulo: "Aprovações" },
];

const PAPEIS: Record<string, string> = { socio: "Sócio(a)", advogado: "Advogado(a)", estagiario: "Estagiário(a)", administrativo: "Administrativo" };

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/sem-escritorio");
  const socio = sessao.papel === "socio";
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <Link href="/hoje" className="font-semibold">
            Assistente Jurídica
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {ITENS.map((i) => (
              <Link key={i.href} href={i.href} className="rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                {i.rotulo}
              </Link>
            ))}
            {socio ? (
              <>
                <Link href="/configuracoes" className="rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  Configurações
                </Link>
                <Link href="/admin/status" className="rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  Rotinas
                </Link>
              </>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span>{sessao.nome}</span>
            <Badge tom="contorno">{PAPEIS[sessao.papel] ?? sessao.papel}</Badge>
            <form action={sair}>
              <button type="submit" className="text-zinc-500 hover:underline">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-4">{children}</main>
    </div>
  );
}
