import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { contarPublicacoesPorStatus, FONTES_PUBLICACAO, lerFiltrosPublicacoes, listarMembros, listarPublicacoes, POR_PAGINA, STATUS_PENDENTES, STATUS_PUBLICACAO, type FiltrosPublicacoes } from "@/server/publicacoes";
import { CaixaPublicacoes, ROTULO_FONTE, ROTULO_STATUS_PUBLICACAO } from "@/components/dominio/CaixaPublicacoes";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button, classesBotao } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const metadata = { title: "Publicações" };
export const dynamic = "force-dynamic";

type Query = Record<string, string | undefined>;

function montarQuery(filtros: FiltrosPublicacoes, mudancas: Partial<Record<keyof FiltrosPublicacoes, string | number | undefined>> = {}): string {
  const q = new URLSearchParams();
  const valores: Record<string, string | number | undefined> = { status: filtros.status, fonte: filtros.fonte, data: filtros.data, responsavel: filtros.responsavel, busca: filtros.busca, pagina: filtros.pagina > 1 ? filtros.pagina : undefined, ...mudancas };
  for (const [k, v] of Object.entries(valores)) if (v !== undefined && v !== "" && !(k === "status" && v === "pendentes") && !(k === "pagina" && Number(v) <= 1)) q.set(k, String(v));
  const s = q.toString();
  return s ? `/publicacoes?${s}` : "/publicacoes";
}

export default async function PaginaPublicacoes({ searchParams }: { searchParams: Promise<Query> }) {
  const sessao = await exigirSessao();
  const q = await searchParams;
  const filtros = lerFiltrosPublicacoes(q);
  const supabase = await criarClienteServidor();

  const [{ itens, total }, contagens, membros] = await Promise.all([listarPublicacoes(supabase, filtros), contarPublicacoesPorStatus(supabase), listarMembros(supabase)]);
  const responsaveis = membros.filter((m) => m.usuario_id && (m.papel === "socio" || m.papel === "advogado"));
  const totalPendentes = STATUS_PENDENTES.reduce((s, st) => s + (contagens[st] ?? 0), 0);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const podeLancar = sessao.papel !== "estagiario";
  const filtrosAtivos = Boolean(filtros.fonte || filtros.data || filtros.responsavel || filtros.busca);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Publicações</h1>
          <p className="mt-1 text-sm text-zinc-500">Caixa de entrada do DJEN e lançamentos manuais. O texto só aparece no detalhe.</p>
        </div>
        {podeLancar ? (
          <Link href="/publicacoes/nova" className={classesBotao()}>
            <Plus aria-hidden />
            Lançar intimação
          </Link>
        ) : null}
      </div>

      {q.erro ? <Alert tom="perigo">{q.erro}</Alert> : null}
      {q.ok ? <Alert tom="sucesso">{q.ok}</Alert> : null}

      <nav aria-label="Filtrar por status" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 whitespace-nowrap md:mx-0 md:flex-wrap md:px-0 md:whitespace-normal">
        <Chip ativo={filtros.status === "pendentes"} href={montarQuery(filtros, { status: "pendentes", pagina: 1 })} rotulo="Pendentes" valor={totalPendentes} atencao={totalPendentes > 0} />
        {STATUS_PUBLICACAO.map((st) => (
          <Chip key={st} ativo={filtros.status === st} href={montarQuery(filtros, { status: st, pagina: 1 })} rotulo={ROTULO_STATUS_PUBLICACAO[st]} valor={contagens[st] ?? 0} />
        ))}
        <Chip ativo={filtros.status === "todas"} href={montarQuery(filtros, { status: "todas", pagina: 1 })} rotulo="Todas" valor={Object.values(contagens).reduce((a, b) => a + b, 0)} />
      </nav>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <form method="get" action="/publicacoes" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
            <input type="hidden" name="status" value={filtros.status} />
            <Campo label="Fonte">
              <Select id="fonte" name="fonte" defaultValue={filtros.fonte ?? ""}>
                <option value="">Todas</option>
                {FONTES_PUBLICACAO.map((f) => (
                  <option key={f} value={f}>
                    {ROTULO_FONTE[f] ?? f}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Disponibilizada em">
              <Input id="data" name="data" type="date" defaultValue={filtros.data ?? ""} />
            </Campo>
            <Campo label="Responsável">
              <Select id="responsavel" name="responsavel" defaultValue={filtros.responsavel ?? ""}>
                <option value="">Todos</option>
                {responsaveis.map((m) => (
                  <option key={m.usuario_id as string} value={m.usuario_id as string}>
                    {m.nome_completo}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Número do processo">
              <span className="relative block">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                <Input id="busca" name="busca" placeholder="CNJ com ou sem máscara" defaultValue={filtros.busca ?? ""} className="pl-9" />
              </span>
            </Campo>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
              <Button type="submit" variante="secundaria" className="flex-1 lg:flex-none">
                Filtrar
              </Button>
              <Link href="/publicacoes" className={classesBotao({ variante: "fantasma", className: filtrosAtivos ? undefined : "text-zinc-400" })}>
                Limpar
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <CaixaPublicacoes itens={itens} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-zinc-500">
        <span className="tabular-nums">
          {total === 1 ? "1 publicação" : `${total} publicações`} · página {filtros.pagina} de {paginas}
        </span>
        {paginas > 1 ? (
          <span className="flex gap-2">
            {filtros.pagina > 1 ? (
              <Link href={montarQuery(filtros, { pagina: filtros.pagina - 1 })} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                <ChevronLeft aria-hidden />
                Anterior
              </Link>
            ) : null}
            {filtros.pagina < paginas ? (
              <Link href={montarQuery(filtros, { pagina: filtros.pagina + 1 })} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                Próxima
                <ChevronRight aria-hidden />
              </Link>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Chip({ ativo, href, rotulo, valor, atencao = false }: { ativo: boolean; href: string; rotulo: string; valor: number; atencao?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors",
        ativo ? "border-marca-600 bg-marca-600 text-white shadow-marca" : "border-zinc-200 bg-white text-zinc-700 shadow-xs hover:border-zinc-300 hover:bg-zinc-50",
      )}
    >
      {rotulo}
      <span className={cn("rounded-full px-1.5 text-[11px] leading-[18px] font-bold tabular-nums", ativo ? "bg-white/20 text-white" : atencao ? "bg-ouro-100 text-ouro-700" : "bg-zinc-100 text-zinc-600")}>{valor}</span>
    </Link>
  );
}
