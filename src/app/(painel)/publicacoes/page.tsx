import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { contarPublicacoesPorStatus, FONTES_PUBLICACAO, lerFiltrosPublicacoes, listarMembros, listarPublicacoes, POR_PAGINA, STATUS_PENDENTES, STATUS_PUBLICACAO, type FiltrosPublicacoes } from "@/server/publicacoes";
import { CaixaPublicacoes, ROTULO_FONTE, ROTULO_STATUS_PUBLICACAO } from "@/components/dominio/CaixaPublicacoes";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Publicações</h1>
          <p className="text-sm text-zinc-500">Caixa de entrada do DJEN e lançamentos manuais. O texto só aparece no detalhe.</p>
        </div>
        {podeLancar ? (
          <Link href="/publicacoes/nova">
            <Button>Lançar publicação</Button>
          </Link>
        ) : null}
      </div>

      {q.erro ? <Alert tom="perigo">{q.erro}</Alert> : null}
      {q.ok ? <Alert tom="sucesso">{q.ok}</Alert> : null}

      <div className="flex flex-wrap gap-1 text-sm">
        <Chip ativo={filtros.status === "pendentes"} href={montarQuery(filtros, { status: "pendentes", pagina: 1 })} rotulo="Pendentes" valor={totalPendentes} />
        {STATUS_PUBLICACAO.map((st) => (
          <Chip key={st} ativo={filtros.status === st} href={montarQuery(filtros, { status: st, pagina: 1 })} rotulo={ROTULO_STATUS_PUBLICACAO[st]} valor={contagens[st] ?? 0} />
        ))}
        <Chip ativo={filtros.status === "todas"} href={montarQuery(filtros, { status: "todas", pagina: 1 })} rotulo="Todas" valor={Object.values(contagens).reduce((a, b) => a + b, 0)} />
      </div>

      <Card>
        <CardContent className="p-4">
          <form method="get" action="/publicacoes" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <input type="hidden" name="status" value={filtros.status} />
            <div>
              <Label htmlFor="fonte">Fonte</Label>
              <Select id="fonte" name="fonte" defaultValue={filtros.fonte ?? ""}>
                <option value="">Todas</option>
                {FONTES_PUBLICACAO.map((f) => (
                  <option key={f} value={f}>
                    {ROTULO_FONTE[f] ?? f}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="data">Disponibilizada em</Label>
              <Input id="data" name="data" type="date" defaultValue={filtros.data ?? ""} />
            </div>
            <div>
              <Label htmlFor="responsavel">Responsável</Label>
              <Select id="responsavel" name="responsavel" defaultValue={filtros.responsavel ?? ""}>
                <option value="">Todos</option>
                {responsaveis.map((m) => (
                  <option key={m.usuario_id as string} value={m.usuario_id as string}>
                    {m.nome_completo}
                  </option>
                ))}
              </Select>
            </div>
            <div className="lg:col-span-2">
              <Label htmlFor="busca">Número do processo</Label>
              <Input id="busca" name="busca" placeholder="CNJ com ou sem máscara" defaultValue={filtros.busca ?? ""} />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" variante="secundaria">
                Filtrar
              </Button>
              <Link href="/publicacoes" className="text-sm text-zinc-500 hover:underline">
                Limpar
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <CaixaPublicacoes itens={itens} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-500">
        <span>
          {total} publicação(ões) · página {filtros.pagina} de {paginas}
        </span>
        <span className="flex gap-2">
          {filtros.pagina > 1 ? (
            <Link href={montarQuery(filtros, { pagina: filtros.pagina - 1 })} className="rounded-md border px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              Anterior
            </Link>
          ) : null}
          {filtros.pagina < paginas ? (
            <Link href={montarQuery(filtros, { pagina: filtros.pagina + 1 })} className="rounded-md border px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              Próxima
            </Link>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function Chip({ ativo, href, rotulo, valor }: { ativo: boolean; href: string; rotulo: string; valor: number }) {
  return (
    <Link href={href} className={`rounded-full border px-3 py-1 ${ativo ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"}`}>
      {rotulo} <span className={ativo ? "opacity-80" : "text-zinc-500"}>{valor}</span>
    </Link>
  );
}
