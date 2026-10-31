import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { identificarTribunal } from "@/lib/tribunais/codigos";
import { Markdown } from "@/components/dominio/Markdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/processos/${id}`} className="text-sm text-zinc-500 hover:underline">
          ← Processo
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Mapa do julgador</h1>
        <p className="font-mono text-sm text-zinc-500">{(processo.numero_cnj_mascara as string | null) ?? "sem número"}</p>
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
            <form action={gerarMapaJulgadorAction.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
              <Campo label="Foco (opcional)">
                <Input name="foco" placeholder="ex.: conferir a prescrição das parcelas" />
              </Campo>
              <div className="flex items-end justify-end">
                <Button type="submit">Analisar como julgador</Button>
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
            <Markdown texto={String(ultima.conteudo_md ?? "")} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
