import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ClipboardCheck, LogOut, Sparkles } from "lucide-react";
import { obterSessao } from "@/server/sessao";
import { sair } from "@/app/(auth)/login/actions";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigirMfaSeNecessario } from "@/server/mfa";
import { cn } from "@/lib/utils";
import { SeletorEscritorio } from "./seletor-escritorio";
import { gruposDoMenu } from "./menu";
import { BarraInferior, MenuLateral } from "./menu-lateral";

const PAPEIS: Record<string, string> = { socio: "Sócio(a)", advogado: "Advogado(a)", estagiario: "Estagiário(a)", administrativo: "Administrativo", suporte: "Suporte (leitura)" };

/** Iniciais para o avatar e o logotipo: primeira letra das duas primeiras palavras relevantes. */
function iniciais(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-Z]/.test(p));
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || nome.slice(0, 2).toUpperCase();
}

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/sem-escritorio");
  const supabase = await criarClienteServidor();
  const aprova = sessao.papel === "socio" || sessao.papel === "advogado";
  const [, { count }, { count: pendentes }, { count: publicacoesATratar }, { count: prazosSugeridos }] = await Promise.all([
    exigirMfaSeNecessario(sessao),
    supabase.from("notificacoes").select("id", { count: "exact", head: true }).eq("destinatario_id", sessao.usuarioId).eq("canal", "painel").in("status", ["enviada", "entregue"]).is("lida_em", null),
    aprova ? supabase.from("aprovacoes").select("id", { count: "exact", head: true }).eq("status", "pendente") : Promise.resolve({ count: 0 }),
    supabase.from("publicacoes").select("id", { count: "exact", head: true }).in("status", ["nova", "classificada", "vinculada", "sem_processo", "com_prazo_sugerido"]),
    supabase.from("prazos").select("id", { count: "exact", head: true }).eq("status", "sugerido"),
  ]);
  const naoLidas = count ?? 0;
  const aprovacoesPendentes = pendentes ?? 0;
  const contadores = { publicacoes: publicacoesATratar ?? 0, prazos: prazosSugeridos ?? 0 };
  const grupos = gruposDoMenu(sessao.papel);
  const nomeEscritorio = sessao.vinculos.find((v) => v.escritorioId === sessao.escritorioId)?.nome ?? "Escritório";

  const blocoUsuario = (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-2.5 shadow-xs">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-marca-50 text-xs font-bold text-marca-700" aria-hidden>
        {iniciais(sessao.nome)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-tight text-zinc-950">{sessao.nome}</span>
        <span className="block truncate text-[11.5px] text-zinc-500">{PAPEIS[sessao.papel] ?? sessao.papel}</span>
      </span>
      <form action={sair}>
        <button type="submit" className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900" aria-label="Sair" title="Sair">
          <LogOut className="h-4 w-4" />
        </button>
      </form>
    </div>
  );

  const atalhos = (
    <>
      <Link href="/assistente" className="inline-flex h-9 items-center gap-2 rounded-lg bg-marca-50 px-3 text-sm font-semibold text-marca-700 transition-colors hover:bg-marca-100" title="Perguntar à assistente">
        <Sparkles className="h-4 w-4" aria-hidden />
        Assistente
      </Link>
      {aprova ? (
        <Link href="/aprovacoes" className="relative inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900" aria-label={aprovacoesPendentes ? `Aprovações: ${aprovacoesPendentes} pendentes` : "Aprovações"} title="Aprovações pendentes">
          <ClipboardCheck className="h-[18px] w-[18px]" aria-hidden />
          <span className="hidden lg:inline">Aprovações</span>
          <span className="lg:hidden">Aprovações</span>
          {aprovacoesPendentes ? <Contador tom="ouro">{aprovacoesPendentes}</Contador> : null}
        </Link>
      ) : null}
      <Link href="/notificacoes" className="relative inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 md:w-9 md:justify-center md:px-0" aria-label={naoLidas ? `Notificações: ${naoLidas} não lidas` : "Notificações"} title="Notificações">
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        <span className="md:hidden">Notificações</span>
        {naoLidas ? <Contador tom="vermelho">{naoLidas}</Contador> : null}
      </Link>
    </>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-zinc-200 bg-white px-3 py-4 md:flex">
        <Link href="/hoje" className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-zinc-50">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-marca-600 to-marca-400 text-[13px] font-extrabold tracking-wide text-white shadow-marca" aria-hidden>
            {iniciais(nomeEscritorio)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-bold leading-tight text-zinc-950">{nomeEscritorio}</span>
            <span className="block text-[11px] font-medium tracking-wide text-zinc-500 uppercase">Assistente jurídica</span>
          </span>
        </Link>
        <MenuLateral grupos={grupos} contadores={contadores} />
        <div className="mt-auto">{blocoUsuario}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md">
          <div className="flex h-14 items-center gap-2 px-4 md:px-8">
            <Link href="/hoje" className="flex items-center gap-2.5 md:hidden">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-marca-600 to-marca-400 text-[11px] font-extrabold text-white" aria-hidden>
                {iniciais(nomeEscritorio)}
              </span>
              <span className="truncate text-sm font-bold text-zinc-950">{nomeEscritorio}</span>
            </Link>
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <SeletorEscritorio vinculos={sessao.vinculos} atual={sessao.escritorioId} />
              <div className="hidden items-center gap-1 md:flex">{atalhos}</div>
              <Link href="/notificacoes" className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 md:hidden" aria-label={naoLidas ? `Notificações: ${naoLidas} não lidas` : "Notificações"}>
                <Bell className="h-[18px] w-[18px]" aria-hidden />
                {naoLidas ? <Contador tom="vermelho">{naoLidas}</Contador> : null}
              </Link>
              {aprova ? (
                <Link href="/aprovacoes" className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 md:hidden" aria-label={aprovacoesPendentes ? `Aprovações: ${aprovacoesPendentes} pendentes` : "Aprovações"}>
                  <ClipboardCheck className="h-[18px] w-[18px]" aria-hidden />
                  {aprovacoesPendentes ? <Contador tom="ouro">{aprovacoesPendentes}</Contador> : null}
                </Link>
              ) : null}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 md:px-8 md:pt-8 md:pb-10">{children}</main>
      </div>

      <BarraInferior grupos={grupos} contadores={contadores} rodape={blocoUsuario} atalhos={atalhos} />
    </div>
  );
}

function Contador({ tom, children }: { tom: "ouro" | "vermelho"; children: React.ReactNode }) {
  return <span className={cn("absolute -top-0.5 -right-0.5 min-w-[17px] rounded-full border-2 border-white px-1 text-center text-[10px] font-bold leading-[13px] text-white", tom === "ouro" ? "bg-ouro-500" : "bg-red-600")}>{children}</span>;
}
