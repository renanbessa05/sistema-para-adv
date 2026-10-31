"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckSquare, FileText, LifeBuoy, Menu, Newspaper, Scale, Settings, Sun, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { HREFS_BARRA_INFERIOR, type GrupoMenu, type IconeMenu } from "./menu";

const ICONES: Record<IconeMenu, React.ComponentType<{ className?: string }>> = {
  hoje: Sun,
  publicacoes: Newspaper,
  prazos: CalendarDays,
  tarefas: CheckSquare,
  processos: Scale,
  clientes: Users,
  pecas: FileText,
  configuracoes: Settings,
  suporte: LifeBuoy,
};

export type Contadores = { publicacoes?: number; prazos?: number };

/** Ativo quando a rota atual é o item ou está dentro dele (ex.: /processos/123 destaca Processos). */
function ativo(caminho: string, href: string): boolean {
  return caminho === href || caminho.startsWith(`${href}/`);
}

export function MenuLateral({ grupos, contadores }: { grupos: GrupoMenu[]; contadores?: Contadores }) {
  const caminho = usePathname();
  return (
    <nav aria-label="Principal" className="flex flex-col gap-6">
      {grupos.map((g) => (
        <div key={g.titulo} className="flex flex-col gap-0.5">
          <p className="mb-1.5 px-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-zinc-400">{g.titulo}</p>
          {g.itens.map((i) => {
            const on = ativo(caminho, i.href);
            const Icone = ICONES[i.icone];
            const n = i.contador ? contadores?.[i.contador] : undefined;
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors",
                  on ? "bg-marca-50 font-semibold text-marca-700" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                )}
              >
                {on ? <span aria-hidden className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r bg-marca-600" /> : null}
                <Icone className={cn("h-[17px] w-[17px] shrink-0", on ? "text-marca-600" : "text-zinc-400")} />
                <span className="truncate">{i.rotulo}</span>
                {n ? <span className={cn("ml-auto rounded-full px-1.5 text-[11px] font-bold leading-[18px] text-white", i.contador === "publicacoes" ? "bg-ouro-500" : "bg-marca-600")}>{n > 99 ? "99+" : n}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/**
 * Barra inferior do celular: quatro itens fixos e "Mais", que abre uma folha com o menu inteiro,
 * os atalhos do cabeçalho e a saída. `rodape` recebe o bloco do usuário e o botão Sair (vêm do servidor).
 */
export function BarraInferior({ grupos, contadores, rodape, atalhos }: { grupos: GrupoMenu[]; contadores?: Contadores; rodape: React.ReactNode; atalhos: React.ReactNode }) {
  const caminho = usePathname();
  const [aberto, setAberto] = React.useState(false);
  const todos = grupos.flatMap((g) => g.itens);
  const fixos = HREFS_BARRA_INFERIOR.map((h) => todos.find((i) => i.href === h)).filter((i): i is NonNullable<typeof i> => Boolean(i));
  const algumFixoAtivo = fixos.some((i) => ativo(caminho, i.href));

  React.useEffect(() => {
    if (!aberto) return;
    const fechar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("keydown", fechar);
    return () => document.removeEventListener("keydown", fechar);
  }, [aberto]);

  return (
    <>
      <nav aria-label="Principal (celular)" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-zinc-200 bg-white/92 px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        {fixos.map((i) => {
          const on = ativo(caminho, i.href);
          const Icone = ICONES[i.icone];
          const n = i.contador ? contadores?.[i.contador] : undefined;
          return (
            <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} className={cn("relative flex flex-col items-center gap-1 rounded-lg py-1.5 text-[10.5px] font-semibold", on ? "text-marca-600" : "text-zinc-500")}>
              <Icone className="h-[21px] w-[21px]" />
              {n ? <span className={cn("absolute top-0 right-1/2 -mr-5 min-w-4 rounded-full px-1 text-[10px] font-bold leading-4 text-white", i.contador === "publicacoes" ? "bg-ouro-500" : "bg-marca-600")}>{n > 99 ? "99+" : n}</span> : null}
              {i.rotulo}
            </Link>
          );
        })}
        <button type="button" onClick={() => setAberto(true)} aria-expanded={aberto} aria-controls="menu-mais" className={cn("flex flex-col items-center gap-1 rounded-lg py-1.5 text-[10.5px] font-semibold", !algumFixoAtivo ? "text-marca-600" : "text-zinc-500")}>
          <Menu className="h-[21px] w-[21px]" />
          Mais
        </button>
      </nav>

      {aberto ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu completo" id="menu-mais">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]" onClick={() => setAberto(false)} />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg entrar"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) setAberto(false);
            }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-200" aria-hidden />
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-bold text-zinc-950">Menu</p>
              <button type="button" onClick={() => setAberto(false)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">{atalhos}</div>
            <div className="flex flex-col gap-4">
              {grupos.map((g) => (
                <div key={g.titulo}>
                  <p className="mb-1.5 px-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-zinc-400">{g.titulo}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {g.itens.map((i) => {
                      const on = ativo(caminho, i.href);
                      const Icone = ICONES[i.icone];
                      const n = i.contador ? contadores?.[i.contador] : undefined;
                      return (
                        <Link key={i.href} href={i.href} className={cn("flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium", on ? "border-marca-200 bg-marca-50 text-marca-700" : "border-zinc-200 text-zinc-700")}>
                          <Icone className={cn("h-[18px] w-[18px]", on ? "text-marca-600" : "text-zinc-400")} />
                          {i.rotulo}
                          {n ? <span className={cn("ml-auto rounded-full px-1.5 text-[11px] font-bold leading-[18px] text-white", i.contador === "publicacoes" ? "bg-ouro-500" : "bg-marca-600")}>{n}</span> : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 border-t border-zinc-200 pt-4">{rodape}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
