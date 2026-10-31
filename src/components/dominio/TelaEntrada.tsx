import * as React from "react";
import { CalendarCheck2, FileText, Newspaper } from "lucide-react";

/**
 * Moldura das telas fora do painel (login, segundo fator, convite, sem escritório): painel da marca à esquerda
 * em telas largas e o conteúdo (um cartão) à direita. No celular só o conteúdo aparece, com o nome em cima.
 */
export function TelaEntrada({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen bg-zinc-50 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="relative hidden overflow-hidden bg-marca-900 text-white lg:flex lg:flex-col lg:justify-between lg:p-12" aria-hidden>
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-marca-600/40 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 -bottom-40 h-[28rem] w-[28rem] rounded-full bg-marca-400/25 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-sm font-extrabold tracking-wide ring-1 ring-white/20">CA</span>
          <div>
            <p className="text-[15px] font-bold leading-tight">Costa Abdo Advocacia</p>
            <p className="text-[11px] font-medium tracking-[0.12em] text-marca-200 uppercase">Assistente jurídica</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-[34px] leading-[1.15] font-extrabold tracking-[-0.02em] text-balance">O dia começa pela publicação e termina com o protocolo.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-marca-100/90">Publicações do DJEN classificadas, prazos sugeridos e conferidos, tarefas distribuídas e peças revisadas. Tudo passa por uma decisão sua.</p>
          <ul className="mt-8 flex flex-col gap-3 text-sm text-marca-100">
            <li className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <Newspaper className="h-4 w-4" />
              </span>
              Publicações lidas e classificadas automaticamente
            </li>
            <li className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <CalendarCheck2 className="h-4 w-4" />
              </span>
              Prazos contados com o calendário forense do TJ-MT
            </li>
            <li className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <FileText className="h-4 w-4" />
              </span>
              Peças redigidas, revisadas e aprovadas no mesmo lugar
            </li>
          </ul>
        </div>
        <p className="relative text-xs text-marca-200/70">Uso interno do escritório. Acesso só por convite.</p>
      </section>
      <section className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-6 flex items-center gap-3 lg:hidden">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-marca-600 to-marca-400 text-xs font-extrabold text-white shadow-marca">CA</span>
          <div>
            <p className="text-sm font-bold leading-tight text-zinc-950">Costa Abdo Advocacia</p>
            <p className="text-[10.5px] font-medium tracking-[0.12em] text-zinc-500 uppercase">Assistente jurídica</p>
          </div>
        </div>
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
