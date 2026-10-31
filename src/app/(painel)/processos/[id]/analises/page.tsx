import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gavel } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { identificarTribunal } from "@/lib/tribunais/codigos";
import { Markdown } from "@/components/dominio/Markdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { BotaoEnviar } from "@/components/ui/BotaoEnviar";
import { Campo, Input } from "@/components/ui/input";
import { gerarMapaJulgadorAction } from "./actions";

export const metadata = { title: "Mapa do julgador" };
export const dynamic = "force-dynamic";

export default async function PaginaAnalises({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const sessao = await exigirSessao();
  const { id } = await params;
  const { ok, erro } = await searchParams;
  const supabase = await criarClienteServidor();
  const { data: processo } = await supabase.from("processos").select("id, numero_cnj, numero_cnj_mascara").eq("id", id).maybeSingle();
  if (!processo) notFound();
  const tribunal = identificarTribunal(String(processo.numero_cnj));
  const { data: analises } = await supabase
    .from("analises")
    .select("id, conteudo_md, criado_em, parametros, estruturado")
    .eq("processo_id", id)
    .eq("tipo", "mapa_julgador")
    .order("criado_em", { ascending: false })
    .limit(5);
  const ultima = analises?.[0] ?? null;
  const podeGerar = ["socio", "advogado"].includes(sessao.papel) && tribunal.mato_grosso;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex items-start gap-4">
        <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-marca-50 text-marca-600 sm:grid" aria-hidden>
          <Gavel className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <Link href={`/processos/${id}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-500 hover:text-marca-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Processo
          </Link>
          <h1 className="mt-1 text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Mapa do julgador</h1>
          <p className="font-mono text-sm text-zinc-500">{(processo.numero_cnj_mascara as string | null) ?? "sem número"}</p>
        </div>
      </div>
      <Alert tom="alerta">Previsão judicial para estudo do caso, do ponto de vista neutro de quem julga. Não é decisão oficial e não substitui o magistrado.</Alert>
      {!tribunal.mato_grosso ? <Alert tom="info">Esta análise é da skill do TJ-MT. Para outros tribunais, use a análise em outro tribunal.</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {podeGerar ? (
        <Card>
          <CardHeader>
            <CardTitle>Gerar mapa e minuta</CardTitle>
            <CardDescription>Os autos (PDF) precisam estar anexados ao processo. O foco é opcional e não altera a neutralidade da análise.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={gerarMapaJulgadorAction.bind(null, id)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Campo label="Foco (opcional)" className="min-w-0 flex-1">
                <Input name="foco" placeholder="ex.: conferir a prescrição das parcelas" />
              </Campo>
              <div className="flex justify-end">
                <BotaoEnviar rotuloEnviando="Analisando… pode levar uns minutos" className="h-10 w-full sm:w-auto">
                  Analisar como julgador
                </BotaoEnviar>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
      {ultima ? (
        <Card>
          <CardHeader>
            <CardTitle>Última análise</CardTitle>
            <CardDescription>Gerada em {new Date(String(ultima.criado_em)).toLocaleString("pt-BR")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Markdown texto={String(ultima.conteudo_md ?? "")} className="leading-relaxed" />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
