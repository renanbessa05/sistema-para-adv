import Link from "next/link";
import { redirect } from "next/navigation";
import { obterSessao } from "@/server/sessao";
import { sair } from "@/app/(auth)/login/actions";
import { Badge } from "@/components/ui/badge";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirMfaSeNecessario } from "@/server/mfa";
import { SeletorEscritorio } from "./seletor-escritorio";

const ITENS = [
  { href: "/hoje", rotulo: "Hoje" },
  { href: "/assistente", rotulo: "Assistente" },
  { href: "/publicacoes", rotulo: "Publicações" },
  { href: "/prazos", rotulo: "Prazos" },
  { href: "/tarefas", rotulo: "Tarefas" },
  { href: "/processos", rotulo: "Processos" },
  { href: "/clientes", rotulo: "Clientes" },
  { href: "/atendimento", rotulo: "Atendimento" },
  { href: "/contratos", rotulo: "Contratos" },
  { href: "/minutas", rotulo: "Peças" },
  { href: "/revisor", rotulo: "Revisor" },
  { href: "/calculos", rotulo: "Cálculos" },
  { href: "/jurisprudencia", rotulo: "Jurisprudência" },
  { href: "/audiencias", rotulo: "Audiências" },
  { href: "/aprovacoes", rotulo: "Aprovações" },
];

const PAPEIS: Record<string, string> = { socio: "Sócio(a)", advogado: "Advogado(a)", estagiario: "Estagiário(a)", administrativo: "Administrativo", suporte: "Suporte (leitura)" };

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/sem-escritorio");
  await exigirMfaSeNecessario(sessao);
  const socio = sessao.papel === "socio";
  const supabase = await criarClienteServidor();
  const { count } = await supabase.from("notificacoes").select("id", { count: "exact", head: true }).eq("destinatario_id", sessao.usuarioId).eq("canal", "painel").in("status", ["enviada", "entregue"]).is("lida_em", null);
  const naoLidas = count ?? 0;
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
            <Link href="/configuracoes" className="rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              Configurações
            </Link>
            {socio || sessao.papel === "administrativo" || sessao.papel === "advogado" ? (
              <Link href="/admin/status" className="rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Rotinas
              </Link>
            ) : null}
            {socio || sessao.papel === "administrativo" || sessao.papel === "advogado" ? (
              <Link href="/admin/divergencias" className="rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Divergências
              </Link>
            ) : null}
            {socio ? (
              <Link href="/admin/metricas" className="rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Métricas
              </Link>
            ) : null}
            {socio || sessao.papel === "advogado" ? (
              <Link href="/relatorios" className="rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Relatórios
              </Link>
            ) : null}
            {socio ? (
              <Link href="/admin/ia" className="rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Custo IA
              </Link>
            ) : null}
            {socio ? (
              <Link href="/configuracoes/plano" className="rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Plano
              </Link>
            ) : null}
            {sessao.papel === "suporte" ? (
              <Link href="/admin/suporte" className="rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Suporte
              </Link>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <SeletorEscritorio vinculos={sessao.vinculos} atual={sessao.escritorioId} />
            <Link href="/notificacoes" className="relative rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Notificações">
              🔔{naoLidas ? <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{naoLidas}</span> : null}
            </Link>
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
