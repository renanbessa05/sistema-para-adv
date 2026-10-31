import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterRevisao } from "@/server/revisoes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BotaoEnviar } from "@/components/ui/BotaoEnviar";
import { Button } from "@/components/ui/button";
import { Campo, GrupoCampos, Input, Select, Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/dominio/Markdown";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck, FileSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolverItemAction, revisarAction } from "./actions";

export const metadata = { title: "Revisor" };
export const dynamic = "force-dynamic";

const TOM: Record<string, "sucesso" | "alerta" | "perigo" | "neutro"> = { ok: "sucesso", atencao: "alerta", critico: "perigo", nao_verificavel: "neutro" };
const BORDA_ITEM: Record<string, string> = { ok: "border-l-emerald-400", atencao: "border-l-ouro-400", critico: "border-l-red-500", nao_verificavel: "border-l-zinc-300" };

export default async function PaginaRevisor({ searchParams }: { searchParams: Promise<{ rev?: string; erro?: string }> }) {
  const sessao = await exigirSessao();
  const { rev, erro } = await searchParams;
  const supabase = await criarClienteServidor();
  const revisao = rev ? await obterRevisao(supabase, rev) : null;
  const { data: versaoDaMinuta } = revisao?.minuta_versao_id ? await supabase.from("minuta_versoes").select("minuta_id").eq("id", revisao.minuta_versao_id).maybeSingle() : { data: null };
  const minutaId = (versaoDaMinuta?.minuta_id as string | undefined) ?? null;
  const podeResolver = ["socio", "advogado"].includes(sessao.papel);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex flex-col gap-1">
          {minutaId ? (
            <Link href={`/minutas/${minutaId}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-500 hover:text-marca-700">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Voltar à peça
            </Link>
          ) : (
            <Link href="/minutas" className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-500 hover:text-marca-700">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Peças
            </Link>
          )}
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Revisor de peças</h1>
          <p className="max-w-prose text-sm text-zinc-500">Cole a petição para conferir antes do protocolo. A análise lê como o juiz e a triagem do PJe leriam; o que o sistema consegue conferir sozinho (CNJ, Doc. NN, lacunas, prazo) prevalece sobre a leitura da IA.</p>
        </div>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-marca-600" aria-hidden />
            Peça para revisar
          </CardTitle>
          <CardDescription>Texto colado. Para revisar uma minuta do sistema, use «Revisar esta versão com a IA» na tela da própria peça.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={revisarAction} className="flex flex-col gap-5">
            <GrupoCampos titulo="Identificação" colunas={3}>
              <Campo label="Tipo de peça">
                <Input name="tipo_peca" placeholder="inicial, contestação, apelação…" />
              </Campo>
              <Campo label="Grau">
                <Select name="grau" defaultValue="primeiro">
                  <option value="primeiro">1º grau</option>
                  <option value="segundo">2º grau</option>
                </Select>
              </Campo>
              <Campo label="Número do processo (CNJ, se já ajuizado)" dica="Com o número, o sistema confere a competência e o número no cabeçalho da peça.">
                <Input name="cnj" className="font-mono" />
              </Campo>
            </GrupoCampos>
            <GrupoCampos titulo="Texto" colunas={1}>
              <Campo label="Peça" dica="Cole a peça inteira, do endereçamento aos pedidos. Mínimo de 200 caracteres.">
                <Textarea name="texto" rows={14} required minLength={200} className="leading-relaxed" />
              </Campo>
            </GrupoCampos>
            <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-4">
              <BotaoEnviar rotuloEnviando="Revisando… pode levar uns minutos">Revisar</BotaoEnviar>
            </div>
          </form>
        </CardContent>
      </Card>

      {revisao ? (
        <Card className={cn(revisao.criticos_abertos > 0 ? "border-red-200" : "border-emerald-200")}>
          <CardHeader className="border-b border-zinc-100">
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className={cn("h-4 w-4", revisao.criticos_abertos > 0 ? "text-red-600" : "text-emerald-600")} aria-hidden />
              Resultado
            </CardTitle>
            <CardDescription>
              {revisao.criticos_abertos > 0 ? `${revisao.criticos_abertos} item(ns) crítico(s) aberto(s): a peça não deve ser enviada para aprovação sem resolver ou justificar.` : "Nenhum crítico aberto."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-4">
            <p className="max-w-prose text-sm leading-relaxed font-medium text-zinc-900">{revisao.veredito}</p>
            <ul className="flex flex-col gap-2 text-sm">
              {revisao.itens.map((i) => (
                <li key={i.id} className={cn("flex min-w-0 flex-col gap-1.5 rounded-xl border border-zinc-200 border-l-4 bg-white p-3 shadow-xs", BORDA_ITEM[i.situacao] ?? "border-l-zinc-300")}>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tom={TOM[i.situacao] ?? "neutro"}>{i.situacao}</Badge>
                    <span className="font-mono text-xs text-zinc-600">{i.id}</span>
                    <span className="text-xs text-zinc-500">{i.fonte === "codigo" ? "conferido pelo sistema" : "leitura da IA"}</span>
                  </span>
                  {i.observacao ? <span className="leading-relaxed text-zinc-800">{i.observacao}</span> : null}
                  {i.justificativa ? <span className="text-xs leading-relaxed text-zinc-500">Justificativa: {i.justificativa}</span> : null}
                  {i.situacao === "critico" && !i.justificativa && podeResolver ? (
                    <form action={resolverItemAction.bind(null, revisao.id, i.id)} className="mt-1 flex flex-col gap-2 sm:flex-row">
                      <Input name="justificativa" placeholder="Por que está resolvido ou não se aplica" required className="min-w-0 flex-1" />
                      <Button type="submit" variante="secundaria" tamanho="sm" className="h-10">
                        Resolver
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
            {revisao.relatorio_md ? <Markdown texto={revisao.relatorio_md} className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 leading-relaxed" /> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
