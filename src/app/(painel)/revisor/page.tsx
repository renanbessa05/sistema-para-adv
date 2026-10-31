import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterRevisao } from "@/server/revisoes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select, Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/dominio/Markdown";
import Link from "next/link";
import { resolverItemAction, revisarAction } from "./actions";

export const metadata = { title: "Revisor" };
export const dynamic = "force-dynamic";

const TOM: Record<string, "sucesso" | "alerta" | "perigo" | "neutro"> = { ok: "sucesso", atencao: "alerta", critico: "perigo", nao_verificavel: "neutro" };

export default async function PaginaRevisor({ searchParams }: { searchParams: Promise<{ rev?: string; erro?: string }> }) {
  const sessao = await exigirSessao();
  const { rev, erro } = await searchParams;
  const supabase = await criarClienteServidor();
  const revisao = rev ? await obterRevisao(supabase, rev) : null;
  const { data: versaoDaMinuta } = revisao?.minuta_versao_id ? await supabase.from("minuta_versoes").select("minuta_id").eq("id", revisao.minuta_versao_id).maybeSingle() : { data: null };
  const minutaId = (versaoDaMinuta?.minuta_id as string | undefined) ?? null;
  const podeResolver = ["socio", "advogado"].includes(sessao.papel);
  return (
    <div className="flex flex-col gap-4">
      <div>
        {minutaId ? (
          <Link href={`/minutas/${minutaId}`} className="text-sm text-zinc-500 hover:underline">
            ← Voltar à peça
          </Link>
        ) : (
          <Link href="/minutas" className="text-sm text-zinc-500 hover:underline">
            ← Peças
          </Link>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Revisor de peças</h1>
        <p className="text-sm text-zinc-500">Cole a petição para conferir antes do protocolo. A análise lê como o juiz e a triagem do PJe leriam; o que o sistema consegue conferir sozinho (CNJ, Doc. NN, lacunas, prazo) prevalece sobre a leitura da IA.</p>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Peça para revisar</CardTitle>
          <CardDescription>Texto colado. Para revisar uma minuta do sistema, use «Revisar esta versão com a IA» na tela da própria peça.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={revisarAction} className="grid gap-2 sm:grid-cols-3">
            <Campo label="Tipo de peça">
              <Input name="tipo_peca" placeholder="inicial, contestação, apelação…" />
            </Campo>
            <Campo label="Grau">
              <Select name="grau" defaultValue="primeiro">
                <option value="primeiro">1º grau</option>
                <option value="segundo">2º grau</option>
              </Select>
            </Campo>
            <Campo label="Número do processo (CNJ, se já ajuizado)">
              <Input name="cnj" />
            </Campo>
            <Campo label="Peça" className="sm:col-span-3">
              <Textarea name="texto" rows={14} required minLength={200} />
            </Campo>
            <div className="flex justify-end sm:col-span-3">
              <Button type="submit">Revisar</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {revisao ? (
        <Card>
          <CardHeader>
            <CardTitle>Resultado</CardTitle>
            <CardDescription>
              {revisao.criticos_abertos > 0 ? `${revisao.criticos_abertos} item(ns) crítico(s) aberto(s): a peça não deve ser enviada para aprovação sem resolver ou justificar.` : "Nenhum crítico aberto."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm font-medium">{revisao.veredito}</p>
            <ul className="flex flex-col gap-2 text-sm">
              {revisao.itens.map((i) => (
                <li key={i.id} className="flex flex-col gap-1 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tom={TOM[i.situacao] ?? "neutro"}>{i.situacao}</Badge>
                    <span className="font-mono text-xs">{i.id}</span>
                    <span className="text-xs text-zinc-500">{i.fonte === "codigo" ? "conferido pelo sistema" : "leitura da IA"}</span>
                  </span>
                  {i.observacao ? <span>{i.observacao}</span> : null}
                  {i.justificativa ? <span className="text-xs text-zinc-500">Justificativa: {i.justificativa}</span> : null}
                  {i.situacao === "critico" && !i.justificativa && podeResolver ? (
                    <form action={resolverItemAction.bind(null, revisao.id, i.id)} className="flex gap-1">
                      <Input name="justificativa" placeholder="Por que está resolvido ou não se aplica" required className="flex-1" />
                      <Button type="submit" variante="secundaria" tamanho="sm">
                        Resolver
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
            {revisao.relatorio_md ? <Markdown texto={revisao.relatorio_md} /> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
