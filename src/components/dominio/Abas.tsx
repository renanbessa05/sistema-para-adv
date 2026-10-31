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
    <nav className="flex gap-1 overflow-x-auto whitespace-nowrap border-b border-zinc-200 text-sm" aria-label="Seções">
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
            className={cn("-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2", on ? "border-marca-600 font-medium text-marca-900" : "border-transparent text-zinc-600 hover:border-zinc-300 hover:text-zinc-900")}
          >
            {a.rotulo}
            {a.contagem !== undefined ? <span className={cn("rounded-full px-1.5 text-[11px] leading-4", a.atencao ? "bg-ouro-500 text-white" : "bg-zinc-100 text-zinc-600")}>{a.contagem}</span> : null}
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
