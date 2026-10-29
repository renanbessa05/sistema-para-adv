import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { identificarTribunal } from "@/lib/tribunais/codigos";
import { Markdown } from "@/components/dominio/Markdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/input";
import { gerarOutrosTribunaisAction } from "./actions";

export const metadata = { title: "Análise de outro tribunal" };
export const dynamic = "force-dynamic";

const POLOS = ["autor", "réu", "exequente", "executado", "terceiro", "embargante"] as const;

export default async function PaginaOutrosTribunais({
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
  const { data: ultima } = await supabase
    .from("analises")
    .select("id, conteudo_md, criado_em, parametros")
    .eq("processo_id", id)
    .eq("tipo", "outros_tribunais")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  const podeGerar = ["socio", "advogado"].includes(sessao.papel) && tribunal.aplicavel;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/processos/${id}`} className="text-sm text-zinc-500 hover:underline">
          ← Processo
        </Link>
        <h1 className="text-xl font-semibold">Análise em outro tribunal</h1>
        <p className="font-mono text-sm text-zinc-500">{(processo.numero_cnj_mascara as string | null) ?? "sem número"}</p>
      </div>
      {!tribunal.aplicavel ? <Alert tom="alerta">{tribunal.mato_grosso ? "Este processo é do TJ-MT: use as análises próprias de Mato Grosso." : `Esta análise não se aplica: ${tribunal.motivo}.`}</Alert> : null}
      {tribunal.aplicavel ? <Alert tom="info">Tribunal identificado pelo número CNJ: {tribunal.sigla} ({tribunal.nome}). Regra local não confirmada aparece como “a verificar”.</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {podeGerar ? (
        <Card>
          <CardHeader>
            <CardTitle>Gerar análise</CardTitle>
            <CardDescription>Informe a posição antes de analisar. Os autos (PDF) precisam estar anexados ao processo.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={gerarOutrosTribunaisAction.bind(null, id)} className="grid gap-3 sm:grid-cols-3">
              <Campo label="Polo representado">
                <Select name="polo" defaultValue="autor">
                  {POLOS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Objetivo da peça">
                <Input name="objetivo" required placeholder="ex.: contestar, recorrer, impugnar" />
              </Campo>
              <Campo label="Prazo em curso (até)">
                <Input name="prazo" type="date" />
              </Campo>
              <div className="flex justify-end sm:col-span-3">
                <Button type="submit">Analisar os autos</Button>
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
