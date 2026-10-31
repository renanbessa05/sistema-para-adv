import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMembros, mapaNomes, obterTimezone } from "@/server/publicacoes";
import { linkDoObjeto, listarAprovacoesDecididas, listarAprovacoesPendentes, respostaAtrasada, resumirSnapshot, ROTULO_OBJETO_APROVACAO, ROTULO_STATUS_APROVACAO, TOM_STATUS_APROVACAO, type Aprovacao } from "@/server/aprovacoes";
import { formatarDataHora } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, Vazio } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { decidirAprovacao } from "./actions";

export const metadata = { title: "Aprovações" };
export const dynamic = "force-dynamic";

export default async function PaginaAprovacoes({ searchParams }: { searchParams: Promise<{ aba?: string; erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio" && sessao.papel !== "advogado") redirect("/hoje");
  const { aba: abaBruta, erro, ok } = await searchParams;
  const aba = abaBruta === "decididas" ? "decididas" : "pendentes";
  const supabase = await criarClienteServidor();

  const [pendentes, decididas, membros, timeZone] = await Promise.all([listarAprovacoesPendentes(supabase), aba === "decididas" ? listarAprovacoesDecididas(supabase, 50) : Promise.resolve([] as Aprovacao[]), listarMembros(supabase), obterTimezone(supabase, sessao.escritorioId)]);
  const nomes = mapaNomes(membros);

  const solicitante = (a: Aprovacao) => (a.solicitada_por_tipo === "ia" ? "IA" : a.solicitada_por_id ? nomes.get(a.solicitada_por_id) ?? "usuário" : "usuário");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Aprovações</h1>
        <p className="text-sm text-zinc-500">Tudo que a IA ou o WhatsApp propõe passa por decisão humana. Sócio decide tudo; advogado, o que é dos seus processos.</p>
      </div>

      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      <div role="tablist" className="flex gap-1 border-b border-zinc-200 text-sm dark:border-zinc-800">
        <Link href="/aprovacoes" role="tab" aria-selected={aba === "pendentes"} className={`-mb-px border-b-2 px-3 py-2 font-medium ${aba === "pendentes" ? "border-zinc-900 dark:border-zinc-100" : "border-transparent text-zinc-500"}`}>
          Pendentes <span className="text-zinc-500">{pendentes.length}</span>
        </Link>
        <Link href="/aprovacoes?aba=decididas" role="tab" aria-selected={aba === "decididas"} className={`-mb-px border-b-2 px-3 py-2 font-medium ${aba === "decididas" ? "border-zinc-900 dark:border-zinc-100" : "border-transparent text-zinc-500"}`}>
          Decididas
        </Link>
      </div>

      {aba === "pendentes" ? (
        pendentes.length === 0 ? (
          <Vazio titulo="Nenhuma aprovação pendente" descricao="Quando a IA ou alguém pelo WhatsApp propuser algo, aparece aqui." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {pendentes.map((a) => {
              const atrasada = respostaAtrasada(a);
              const link = linkDoObjeto(a.objeto_tipo, a.objeto_id);
              return (
                <Card key={a.id} className={atrasada ? "border-red-300" : ""}>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      {ROTULO_OBJETO_APROVACAO[a.objeto_tipo] ?? a.objeto_tipo}
                      {atrasada ? <Badge tom="perigo">resposta atrasada</Badge> : null}
                    </CardTitle>
                    <CardDescription>
                      Solicitado por {solicitante(a)} em {formatarDataHora(a.criado_em, timeZone)}
                      {a.prazo_resposta_em ? ` · responder até ${formatarDataHora(a.prazo_resposta_em, timeZone)}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                      {resumirSnapshot(a.conteudo_snapshot).map((p) => (
                        <div key={p.chave}>
                          <dt className="text-xs uppercase tracking-wide text-zinc-500">{p.chave}</dt>
                          <dd className="break-words">{p.valor}</dd>
                        </div>
                      ))}
                    </dl>
                    {link ? (
                      <Link href={link} className="text-sm underline underline-offset-4">
                        Abrir objeto
                      </Link>
                    ) : null}
                    <form action={decidirAprovacao} className="flex flex-col gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                      <input type="hidden" name="id" value={a.id} />
                      <Input name="comentario" placeholder="Comentário (opcional)" />
                      <Input name="ajustes" placeholder="Ajustes (obrigatório em «Ajustar»: texto ou JSON)" />
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" name="decisao" value="aprovada" tamanho="sm">
                          Aprovar
                        </Button>
                        <Button type="submit" name="decisao" value="ajustada" variante="secundaria" tamanho="sm">
                          Ajustar
                        </Button>
                        <Button type="submit" name="decisao" value="rejeitada" variante="contorno" tamanho="sm">
                          Rejeitar
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        <Card>
          <CardContent className="p-0">
            {decididas.length === 0 ? (
              <div className="p-4">
                <Vazio titulo="Nenhuma aprovação decidida" />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Decidida em</TH>
                    <TH>Objeto</TH>
                    <TH>Resumo</TH>
                    <TH>Decisão</TH>
                    <TH>Por</TH>
                    <TH>Comentário</TH>
                  </TR>
                </THead>
                <TBody>
                  {decididas.map((a) => {
                    const link = linkDoObjeto(a.objeto_tipo, a.objeto_id);
                    const resumo = resumirSnapshot(a.conteudo_snapshot, 3)
                      .map((p) => `${p.chave}: ${p.valor}`)
                      .join(" · ");
                    return (
                      <TR key={a.id}>
                        <TD className="whitespace-nowrap text-zinc-500">{formatarDataHora(a.decidida_em, timeZone)}</TD>
                        <TD className="whitespace-nowrap">
                          {link ? (
                            <Link href={link} className="hover:underline">
                              {ROTULO_OBJETO_APROVACAO[a.objeto_tipo] ?? a.objeto_tipo}
                            </Link>
                          ) : (
                            ROTULO_OBJETO_APROVACAO[a.objeto_tipo] ?? a.objeto_tipo
                          )}
                          <span className="block text-xs text-zinc-500">por {solicitante(a)}</span>
                        </TD>
                        <TD className="max-w-md truncate" title={resumo}>
                          {resumo || <span className="text-zinc-400">—</span>}
                        </TD>
                        <TD>
                          <Badge tom={TOM_STATUS_APROVACAO[a.status] ?? "neutro"}>{ROTULO_STATUS_APROVACAO[a.status] ?? a.status}</Badge>
                        </TD>
                        <TD className="whitespace-nowrap">{a.aprovador_id ? nomes.get(a.aprovador_id) ?? "usuário" : "sistema"}</TD>
                        <TD className="max-w-xs truncate" title={a.comentario ?? undefined}>
                          {a.comentario ?? ""}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
