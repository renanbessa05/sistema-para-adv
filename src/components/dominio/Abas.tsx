import Link from "next/link";
import { cn } from "@/lib/utils";

export interface Aba {
  chave: string;
  rotulo: string;
  /** Quantidade mostrada ao lado do rótulo (omitida quando undefined). */
  contagem?: number;
  /** Destaque discreto quando há algo pedindo ação na aba. */
  atencao?: boolean;
}

/**
 * Abas por query string (`?aba=chave`), sem estado no cliente: cada aba é um link e a página de servidor decide o que
 * renderizar. `base` é a rota da tela; `atual` é a chave ativa; `extra` preserva outros parâmetros (ex.: editar=1).
 */
export function Abas({ base, abas, atual, extra }: { base: string; abas: Aba[]; atual: string; extra?: Record<string, string | undefined> }) {
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 whitespace-nowrap border-b border-zinc-200 text-sm md:mx-0 md:px-0" aria-label="Seções">
      {abas.map((a) => {
        const q = new URLSearchParams();
        if (a.chave !== abas[0]?.chave) q.set("aba", a.chave);
        for (const [k, v] of Object.entries(extra ?? {})) if (v) q.set(k, v);
        const qs = q.toString();
        const on = a.chave === atual;
        return (
          <Link
            key={a.chave}
            href={qs ? `${base}?${qs}` : base}
            aria-current={on ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 font-medium transition-colors",
              on ? "border-marca-600 font-semibold text-marca-700" : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-900",
            )}
          >
            {a.rotulo}
            {a.contagem !== undefined ? <span className={cn("rounded-full px-1.5 text-[11px] leading-[18px] font-bold tabular-nums", a.atencao ? "bg-ouro-500 text-white" : on ? "bg-marca-100 text-marca-700" : "bg-zinc-100 text-zinc-600")}>{a.contagem}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Lê a aba pedida na query, caindo na primeira quando o valor não existe. */
export function abaAtual(abas: Aba[], pedida: string | undefined): string {
  return abas.some((a) => a.chave === pedida) ? (pedida as string) : abas[0].chave;
}
