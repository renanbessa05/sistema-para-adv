import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, Check, Clock, ExternalLink, FileText, MessageSquare, RefreshCw, Scale, User, type LucideIcon } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMembros, mapaNomes, obterTimezone } from "@/server/publicacoes";
import { linkDoObjeto, listarAprovacoesDecididas, listarAprovacoesPendentes, respostaAtrasada, resumirSnapshot, ROTULO_OBJETO_APROVACAO, ROTULO_STATUS_APROVACAO, TOM_STATUS_APROVACAO, type Aprovacao } from "@/server/aprovacoes";
import { cn, formatarDataHora } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, Vazio } from "@/components/ui/alert";
import { Button, classesBotao } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Abas } from "@/components/dominio/Abas";
import { decidirAprovacao } from "./actions";

export const metadata = { title: "Aprovações" };
export const dynamic = "force-dynamic";

const ICONE_OBJETO: Record<string, LucideIcon> = {
  prazo: Clock,
  tarefa_reatribuicao: RefreshCw,
  tarefa_conclusao: Check,
  contrato: Scale,
  minuta: FileText,
  mensagem_cliente: MessageSquare,
  calculo: Scale,
};

export default async function PaginaAprovacoes({ searchParams }: { searchParams: Promise<{ aba?: string; erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio" && sessao.papel !== "advogado") redirect("/hoje");
  const { aba: abaBruta, erro, ok } = await searchParams;
  const aba = abaBruta === "decididas" ? "decididas" : "pendentes";
  const supabase = await criarClienteServidor();

  const [pendentes, decididas, membros, timeZone] = await Promise.all([listarAprovacoesPendentes(supabase), aba === "decididas" ? listarAprovacoesDecididas(supabase, 50) : Promise.resolve([] as Aprovacao[]), listarMembros(supabase), obterTimezone(supabase, sessao.escritorioId)]);
  const nomes = mapaNomes(membros);

  const solicitante = (a: Aprovacao) => (a.solicitada_por_tipo === "ia" ? "IA" : a.solicitada_por_id ? nomes.get(a.solicitada_por_id) ?? "usuário" : "usuário");
  const atrasadas = pendentes.filter((a) => respostaAtrasada(a)).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Aprovações</h1>
        <p className="mt-1 max-w-prose text-sm text-zinc-500">Tudo que a IA ou o WhatsApp propõe passa por decisão humana. Sócio decide tudo; advogado, o que é dos seus processos.</p>
      </div>

      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      <Abas
        base="/aprovacoes"
        atual={aba}
        abas={[
          { chave: "pendentes", rotulo: "Pendentes", contagem: pendentes.length, atencao: atrasadas > 0 },
          { chave: "decididas", rotulo: "Decididas" },
        ]}
      />

      {aba === "pendentes" ? (
        pendentes.length === 0 ? (
          <Vazio titulo="Nenhuma aprovação pendente" descricao="Quando a IA ou alguém pelo WhatsApp propuser algo, aparece aqui." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {pendentes.map((a) => {
              const atrasada = respostaAtrasada(a);
              const link = linkDoObjeto(a.objeto_tipo, a.objeto_id);
              const Icone = ICONE_OBJETO[a.objeto_tipo] ?? FileText;
              const pelaIa = a.solicitada_por_tipo === "ia";
              return (
                <Card key={a.id} className={cn("flex flex-col overflow-hidden", atrasada ? "border-red-300 shadow-[0_0_0_3px_rgba(239,68,68,0.08)]" : undefined)}>
                  <div className={cn("flex items-start gap-3.5 border-b px-5 py-4", atrasada ? "border-red-100 bg-red-50/50" : "border-zinc-100 bg-zinc-50/50")}>
                    <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", atrasada ? "bg-red-100 text-red-700" : "bg-marca-50 text-marca-700")} aria-hidden>
                      <Icone className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] leading-tight font-bold text-zinc-950">{ROTULO_OBJETO_APROVACAO[a.objeto_tipo] ?? a.objeto_tipo}</span>
                        {atrasada ? <Badge tom="perigo">resposta atrasada</Badge> : null}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-zinc-500">
                        <span className="inline-flex items-center gap-1.5">
                          {pelaIa ? <Bot className="h-3.5 w-3.5" aria-hidden /> : <User className="h-3.5 w-3.5" aria-hidden />}
                          {solicitante(a)} · {formatarDataHora(a.criado_em, timeZone)}
                        </span>
                        {a.prazo_resposta_em ? (
                          <span className={cn("inline-flex items-center gap-1.5 font-medium tabular-nums", atrasada ? "text-red-600" : "text-ouro-700")}>
                            <Clock className="h-3.5 w-3.5" aria-hidden />
                            responder até {formatarDataHora(a.prazo_resposta_em, timeZone)}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    {link ? (
                      <Link href={link} className={classesBotao({ variante: "contorno", tamanho: "sm", className: "shrink-0" })}>
                        Abrir
                        <ExternalLink aria-hidden />
                      </Link>
                    ) : null}
                  </div>
                  <CardContent className="flex flex-1 flex-col gap-4 pt-4">
                    {resumirSnapshot(a.conteudo_snapshot).length ? (
                      <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                        {resumirSnapshot(a.conteudo_snapshot).map((p) => (
                          <div key={p.chave} className="min-w-0">
                            <dt className="text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase">{p.chave}</dt>
                            <dd className="mt-0.5 text-sm text-zinc-900 break-words">{p.valor}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="text-sm text-zinc-400">Sem resumo do conteúdo.</p>
                    )}
                    <form action={decidirAprovacao} className="mt-auto flex flex-col gap-3 border-t border-zinc-100 pt-4">
                      <input type="hidden" name="id" value={a.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Campo label="Comentário (opcional)">
                          <Input name="comentario" placeholder="Fica no histórico da decisão" />
                        </Campo>
                        <Campo label="Ajustes" dica="Obrigatório em «Ajustar»: texto ou JSON.">
                          <Input name="ajustes" placeholder="O que deve mudar" />
                        </Campo>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="submit" name="decisao" value="aprovada" className="flex-1 sm:flex-none">
                          <Check aria-hidden />
                          Aprovar
                        </Button>
                        <Button type="submit" name="decisao" value="ajustada" variante="secundaria" className="flex-1 sm:flex-none">
                          Ajustar
                        </Button>
                        <Button type="submit" name="decisao" value="rejeitada" variante="contorno" className="flex-1 text-red-700 hover:border-red-200 hover:bg-red-50 sm:ml-auto sm:flex-none">
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
        <Card className="overflow-hidden">
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
                    <TH className="min-w-64">Resumo</TH>
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
                        <TD className="whitespace-nowrap text-zinc-500 tabular-nums">{formatarDataHora(a.decidida_em, timeZone)}</TD>
                        <TD className="whitespace-nowrap">
                          {link ? (
                            <Link href={link} className="font-semibold text-zinc-950 hover:text-marca-700">
                              {ROTULO_OBJETO_APROVACAO[a.objeto_tipo] ?? a.objeto_tipo}
                            </Link>
                          ) : (
                            <span className="font-semibold text-zinc-950">{ROTULO_OBJETO_APROVACAO[a.objeto_tipo] ?? a.objeto_tipo}</span>
                          )}
                          <span className="block text-xs text-zinc-500">por {solicitante(a)}</span>
                        </TD>
                        <TD className="max-w-md truncate text-zinc-600" title={resumo}>
                          {resumo || <span className="text-zinc-400">—</span>}
                        </TD>
                        <TD>
                          <Badge tom={TOM_STATUS_APROVACAO[a.status] ?? "neutro"}>{ROTULO_STATUS_APROVACAO[a.status] ?? a.status}</Badge>
                        </TD>
                        <TD className="whitespace-nowrap text-zinc-700">{a.aprovador_id ? nomes.get(a.aprovador_id) ?? "usuário" : "sistema"}</TD>
                        <TD className="max-w-xs truncate text-zinc-600" title={a.comentario ?? undefined}>
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
