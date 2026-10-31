import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMinutas, ROTULO_STATUS_MINUTA } from "@/server/minutas";
import { ROTULO_AREA, ROTULO_TIPO_PECA } from "@/lib/ia/schemas/minutas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatarData } from "@/lib/utils";

export const metadata = { title: "Peças" };
export const dynamic = "force-dynamic";

const TOM: Record<string, "info" | "sucesso" | "alerta" | "perigo" | "neutro"> = { rascunho: "neutro", em_etapas: "info", redigida: "info", em_revisao_ia: "info", aguardando_aprovacao: "alerta", devolvida: "perigo", aprovada: "sucesso", protocolada: "sucesso", arquivada: "neutro", cancelada: "neutro" };

/** Central de peças: as três portas de entrada em cima, a lista de minutas no meio, as ferramentas de apoio embaixo. */
export default async function PaginaMinutas({ searchParams }: { searchParams: Promise<{ status?: string; erro?: string; ok?: string }> }) {
  await exigirSessao();
  const { status, erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const minutas = await listarMinutas(supabase, { status: status || undefined });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Peças</h1>
        <p className="text-sm text-zinc-500">Tudo que se escreve para o processo começa aqui. Peça ligada a prazo e tarefa fecha os dois ao ser protocolada.</p>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Porta href="/minutas/nova" titulo="Nova peça" descricao="Redação direta, a partir de um rascunho seu, ou em seis etapas com aprovação (caso novo)." principal />
        <Porta href="/revisor" titulo="Revisar peça pronta" descricao="Cole o texto já redigido e receba a conferência de quem vai julgar: OK, atenção ou crítico." />
        <Porta href="/varreduras/nova" titulo="Varrer os autos" descricao="A IA lê os autos a favor do cliente e lista os pontos exploráveis; os aprovados viram peça." />
      </div>

      <div className="flex flex-wrap gap-1 text-sm">
        {["", "em_etapas", "redigida", "aguardando_aprovacao", "devolvida", "aprovada", "protocolada"].map((s) => (
          <Link key={s || "todos"} href={s ? `/minutas?status=${s}` : "/minutas"} className={`rounded-md px-2 py-1 ${(status ?? "") === s ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
            {s ? ROTULO_STATUS_MINUTA[s] : "Todas"}
          </Link>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{minutas.length} minuta(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {minutas.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma minuta.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Título</TH>
                  <TH>Peça</TH>
                  <TH>Processo</TH>
                  <TH>Etapa</TH>
                  <TH>Status</TH>
                  <TH>Atualizada</TH>
                </TR>
              </THead>
              <TBody>
                {minutas.map((m) => (
                  <TR key={m.id}>
                    <TD>
                      <Link href={`/minutas/${m.id}`} className="hover:underline">
                        {m.titulo}
                      </Link>
                    </TD>
                    <TD>
                      {ROTULO_TIPO_PECA[m.tipo_peca]} · {ROTULO_AREA[m.area]} · modo {m.modo}
                    </TD>
                    <TD className="font-mono text-xs">{m.processo_numero ?? "—"}</TD>
                    <TD>{m.modo === "C" ? `${Math.min(m.etapa_atual, 6)}/6` : "redação"}</TD>
                    <TD>
                      <Badge tom={TOM[m.status] ?? "neutro"}>{ROTULO_STATUS_MINUTA[m.status] ?? m.status}</Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-zinc-500">{formatarData(m.atualizado_em.slice(0, 10))}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Ferramentas de apoio</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Porta href="/calculos" titulo="Cálculos" descricao="Atualização de dívida e juros com índices do BCB, memória em PDF e aprovação." />
          <Porta href="/jurisprudencia" titulo="Jurisprudência" descricao="Busca na base importada do escritório, com trechos para citar na peça." />
          <Porta href="/assistente" titulo="Assistente" descricao="Pergunte sobre a carteira em linguagem natural; ela abre a tela certa para agir." />
        </div>
      </div>
    </div>
  );
}

function Porta({ href, titulo, descricao, principal }: { href: string; titulo: string; descricao: string; principal?: boolean }) {
  return (
    <Link href={href} className="group block focus-visible:outline-none">
      <Card className={`h-full transition-colors ${principal ? "border-marca-600 bg-marca-600 text-white hover:bg-marca-700" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"}`}>
        <CardContent className="p-4">
          <p className="font-medium">{titulo} →</p>
          <p className={`text-sm ${principal ? "text-white/80" : "text-zinc-500"}`}>{descricao}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
