import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Hash, Lock, Mail, MapPin, MessageCircle, Pencil, Phone, Plus } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarDocumento, formatarValor, podeEditarProcesso, POLOS, STATUS_PROCESSO } from "@/server/processos";
import { listarMembros, mapaNomes } from "@/server/equipe";
import { listarContratos, listarParcelas, ROTULO_STATUS_CONTRATO } from "@/server/contratos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, classesBotao } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CamposCliente, type ClienteFormulario } from "../formulario-cliente";
import { atualizarCliente } from "../actions";
import { CartaoDocumentos } from "@/components/dominio/CartaoDocumentos";
import { Abas, abaAtual } from "@/components/dominio/Abas";
import { listarDocumentos } from "@/server/documentos";
import { cn, formatarData, formatarDataHora } from "@/lib/utils";
import { ROTULO_MODALIDADE } from "@/lib/honorarios";
import { CartaoContatos, type ContatoCliente } from "./cartao-contatos";

export const metadata = { title: "Cliente" };
export const dynamic = "force-dynamic";

export default async function PaginaCliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string; editar?: string; aba?: string }> }) {
  const sessao = await exigirSessao();
  const { id } = await params;
  const { erro, ok, editar, aba } = await searchParams;
  const supabase = await criarClienteServidor();

  const { data: cliente } = await supabase.from("clientes").select("id, tipo_pessoa, nome, cpf_cnpj, email, telefone_e164, endereco, observacoes, ativo, criado_em").eq("id", id).eq("escritorio_id", sessao.escritorioId).maybeSingle();
  if (!cliente) notFound();

  const veAtendimento = sessao.papel === "socio" || sessao.papel === "advogado";
  const [{ data: partes }, membros, documentos, { data: escritorio }, { data: contatosData }, contratos, { data: conversasData }] = await Promise.all([
    supabase.from("processo_partes").select("processo_id, polo, processos(id, numero_cnj_mascara, status, segredo_justica, responsavel_id)").eq("cliente_id", id).eq("eh_cliente", true),
    listarMembros(supabase, sessao.escritorioId, { somenteAtivos: false }),
    listarDocumentos(supabase, { clienteId: id }).catch(() => []),
    supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).maybeSingle(),
    supabase.from("clientes_contatos").select("id, telefone_e164, verificado_em, opt_in_em, opt_out_em").eq("cliente_id", id).eq("ativo", true).order("criado_em"),
    listarContratos(supabase, { clienteId: id }).catch(() => []),
    veAtendimento ? supabase.from("conversas").select("id, telefone_e164, ultima_mensagem_recebida_em, aberta").eq("cliente_id", id).order("ultima_mensagem_recebida_em", { ascending: false, nullsFirst: false }).limit(20) : Promise.resolve({ data: [] }),
  ]);
  const parcelas = contratos[0] ? await listarParcelas(supabase, contratos[0].id).catch(() => []) : [];
  const conversas = (conversasData ?? []) as { id: string; telefone_e164: string; ultima_mensagem_recebida_em: string | null; aberta: boolean }[];

  const timeZone = (escritorio?.timezone as string | undefined) ?? "America/Cuiaba";
  const nomes = mapaNomes(membros);
  type ParteProcesso = { processo_id: string; polo: string; processos: { id: string; numero_cnj_mascara: string | null; status: string; segredo_justica: boolean; responsavel_id: string | null } | null };
  const processos = ((partes ?? []) as unknown as ParteProcesso[]).filter((p) => p.processos);
  const podeEditar = podeEditarProcesso(sessao.papel);
  const modoEdicao = editar === "1" && podeEditar;
  const dados = cliente as unknown as ClienteFormulario & { id: string; criado_em: string };
  const end = dados.endereco ?? {};
  const enderecoTexto = [end.logradouro, end.numero, end.complemento, end.bairro, end.cidade && end.uf ? `${end.cidade}/${end.uf}` : (end.cidade ?? end.uf), end.cep].filter(Boolean).join(", ");
  const parcelasAbertas = parcelas.filter((p) => p.status === "pendente" || p.status === "atrasada");
  const inativo = dados.ativo === false;
  const nome = dados.nome ?? "Cliente";

  const abas = [
    { chave: "geral", rotulo: "Dados e contatos" },
    { chave: "processos", rotulo: "Processos", contagem: processos.length },
    { chave: "contratos", rotulo: "Contratos e parcelas", contagem: contratos.length, atencao: parcelasAbertas.some((p) => p.status === "atrasada") },
    ...(veAtendimento ? [{ chave: "conversas", rotulo: "Conversas", contagem: conversas.length }] : []),
    { chave: "documentos", rotulo: "Documentos", contagem: documentos.length },
  ];
  const atual = modoEdicao ? "geral" : abaAtual(abas, aba);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className={cn("mt-6 hidden h-14 w-14 shrink-0 place-items-center rounded-2xl text-xl font-extrabold sm:grid", inativo ? "bg-zinc-100 text-zinc-400" : "bg-marca-50 text-marca-700")} aria-hidden>
            {nome.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <Link href="/clientes" className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-500 hover:text-marca-700">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Clientes
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="text-[24px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950 sm:text-[26px]">{nome}</h1>
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge tom="contorno">{dados.tipo_pessoa === "juridica" ? "Pessoa jurídica" : "Pessoa física"}</Badge>
                {inativo ? <Badge tom="neutro">inativo</Badge> : null}
              </span>
            </div>
            <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
              <Fato Icone={Hash} rotulo="CPF/CNPJ" valor={formatarDocumento(dados.cpf_cnpj) || null} vazio="sem CPF/CNPJ" mono />
              <Fato Icone={Mail} rotulo="E-mail" valor={dados.email ?? null} vazio="sem e-mail" />
              <Fato Icone={Phone} rotulo="Telefone" valor={dados.telefone_e164 ?? null} vazio="sem telefone" mono />
            </dl>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:shrink-0 lg:justify-end">
          {podeEditar ? (
            <Link href={modoEdicao ? `/clientes/${id}` : `/clientes/${id}?editar=1`} className={classesBotao({ variante: "contorno" })}>
              <Pencil aria-hidden />
              {modoEdicao ? "Fechar edição" : "Editar"}
            </Link>
          ) : null}
          {podeEditar ? (
            <Link href={`/processos/novo?cliente=${id}`} className={classesBotao({ variante: "contorno" })}>
              <Plus aria-hidden />
              Novo processo
            </Link>
          ) : null}
          {veAtendimento ? (
            <Link href={`/contratos/novo?cliente=${id}`} className={classesBotao({ variante: "primaria" })}>
              <FileText aria-hidden />
              Entrada de caso (contrato)
            </Link>
          ) : null}
        </div>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      <Abas base={`/clientes/${id}`} abas={abas} atual={atual} />

      {atual === "geral" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Card className={modoEdicao ? "lg:col-span-2" : undefined}>
            <CardHeader>
              <CardTitle>Dados</CardTitle>
              <CardDescription>Cadastro usado na qualificação do contrato e da procuração.</CardDescription>
            </CardHeader>
            <CardContent>
              {modoEdicao ? (
                <form action={atualizarCliente.bind(null, id)} className="flex flex-col gap-5">
                  <CamposCliente valor={dados} mostrarAtivo />
                  <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-4">
                    <Link href={`/clientes/${id}`} className={classesBotao({ variante: "contorno" })}>
                      Cancelar
                    </Link>
                    <Button type="submit">Salvar</Button>
                  </div>
                </form>
              ) : (
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Item rotulo="CPF/CNPJ" valor={formatarDocumento(dados.cpf_cnpj)} mono />
                  <Item rotulo="E-mail" valor={dados.email} />
                  <Item rotulo="Telefone" valor={dados.telefone_e164} mono />
                  <Item rotulo="Cadastrado em" valor={formatarDataHora(dados.criado_em, timeZone)} />
                  <Item rotulo="Endereço" valor={enderecoTexto} className="sm:col-span-2" Icone={MapPin} />
                  {dados.observacoes ? <Item rotulo="Observações" valor={dados.observacoes} className="sm:col-span-2" /> : null}
                </dl>
              )}
            </CardContent>
          </Card>
          <div className={cn("min-w-0", modoEdicao ? "lg:col-span-2" : undefined)}>
            <CartaoContatos clienteId={id} contatos={(contatosData ?? []) as ContatoCliente[]} podeGerir={veAtendimento} />
          </div>
        </div>
      ) : null}

      {atual === "processos" ? (
        <Card>
          <CardHeader>
            <CardTitle>Processos do cliente</CardTitle>
            <CardDescription>Processos em que esta pessoa figura como parte cliente.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {processos.length === 0 ? (
              <VazioCartao texto="Nenhum processo vinculado.">
                {podeEditar ? (
                  <Link href={`/processos/novo?cliente=${id}`} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                    <Plus aria-hidden />
                    Novo processo
                  </Link>
                ) : null}
              </VazioCartao>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Número</TH>
                    <TH>Polo</TH>
                    <TH className="hidden sm:table-cell">Responsável</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {processos.map((p) => (
                    <TR key={p.processo_id}>
                      <TD>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Link href={`/processos/${p.processo_id}`} className="font-mono text-xs font-semibold text-zinc-950 hover:text-marca-700 sm:text-[13px]">
                            {p.processos!.numero_cnj_mascara}
                          </Link>
                          {p.processos!.segredo_justica ? (
                            <Badge tom="perigo">
                              <Lock className="h-3 w-3" aria-hidden />
                              sigiloso
                            </Badge>
                          ) : null}
                        </div>
                      </TD>
                      <TD className="text-zinc-600">{POLOS[p.polo] ?? p.polo}</TD>
                      <TD className="hidden text-zinc-600 sm:table-cell">{p.processos!.responsavel_id ? (nomes.get(p.processos!.responsavel_id) ?? "membro") : <span className="text-zinc-400">—</span>}</TD>
                      <TD>
                        <Badge tom={p.processos!.status === "ativo" ? "sucesso" : "neutro"}>{STATUS_PROCESSO[p.processos!.status] ?? p.processos!.status}</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {atual === "contratos" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Contratos de honorários</CardTitle>
              <CardDescription>Entrada do caso: diagnóstico pela IA, cálculo pela Tabela OAB/MT, contrato, procuração e declaração.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {contratos.length === 0 ? (
                <VazioCartao texto="Nenhum contrato. Comece pela entrada do caso.">
                  {veAtendimento ? (
                    <Link href={`/contratos/novo?cliente=${id}`} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                      Entrada de caso
                    </Link>
                  ) : null}
                </VazioCartao>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Criado</TH>
                      <TH>Modalidade</TH>
                      <TH>Valor</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {contratos.map((c) => (
                      <TR key={c.id}>
                        <TD className="whitespace-nowrap tabular-nums">
                          <Link href={`/contratos/${c.id}`} className="font-semibold text-zinc-950 hover:text-marca-700">
                            {formatarDataHora(c.criado_em, timeZone)}
                          </Link>
                        </TD>
                        <TD className="text-zinc-600">{c.modalidade ? (ROTULO_MODALIDADE[c.modalidade] ?? c.modalidade) : "—"}</TD>
                        <TD className="whitespace-nowrap font-medium tabular-nums">{c.valor_fixo ? formatarValor(c.valor_fixo) : c.percentual_exito ? `${c.percentual_exito}% de êxito` : "—"}</TD>
                        <TD>
                          <Badge tom={c.status === "assinado" ? "sucesso" : c.status === "cancelado" ? "neutro" : "info"}>{ROTULO_STATUS_CONTRATO[c.status] ?? c.status}</Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
          {contratos[0] ? (
            <Card>
              <CardHeader>
                <CardTitle>Parcelas</CardTitle>
                <CardDescription>
                  Do contrato mais recente. {parcelasAbertas.length ? `${parcelasAbertas.length} em aberto.` : "Nada em aberto."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {parcelas.length === 0 ? (
                  <VazioCartao texto="Sem parcelas (honorários à vista ou por êxito)." />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Nº</TH>
                        <TH>Vencimento</TH>
                        <TH>Valor</TH>
                        <TH>Status</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {parcelas.map((p) => (
                        <TR key={p.id}>
                          <TD className="font-semibold text-zinc-950 tabular-nums">{p.numero}</TD>
                          <TD className="whitespace-nowrap tabular-nums">{formatarData(p.vencimento)}</TD>
                          <TD className="whitespace-nowrap font-medium tabular-nums">{formatarValor(p.valor)}</TD>
                          <TD>
                            <Badge tom={p.status === "paga" ? "sucesso" : p.status === "atrasada" ? "perigo" : p.status === "cancelada" ? "neutro" : "info"}>{p.status}</Badge>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
                <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                  <Link href={`/contratos/${contratos[0].id}`} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                    Marcar parcelas no contrato
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      {atual === "conversas" ? (
        <Card>
          <CardHeader>
            <CardTitle>Conversas por WhatsApp</CardTitle>
            <CardDescription>Respostas da IA ficam em rascunho até a aprovação. O contato precisa estar verificado e autorizado na aba Dados e contatos.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {conversas.length === 0 ? (
              <VazioCartao texto="Nenhuma conversa com este cliente." />
            ) : (
              <ul className="divide-y divide-zinc-100 text-sm">
                {conversas.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2">
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", c.aberta ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-500")} aria-hidden>
                      <MessageCircle className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <Link href={`/atendimento?conversa=${c.id}`} className="block truncate font-mono text-[13px] font-semibold text-zinc-950 hover:text-marca-700">
                        {c.telefone_e164}
                      </Link>
                      <span className="block text-xs text-zinc-500 tabular-nums">{c.ultima_mensagem_recebida_em ? `última mensagem ${formatarDataHora(c.ultima_mensagem_recebida_em, timeZone)}` : "sem mensagens"}</span>
                    </span>
                    <Badge tom={c.aberta ? "info" : "neutro"}>{c.aberta ? "aberta" : "encerrada"}</Badge>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
              <Link href="/atendimento" className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                <MessageCircle aria-hidden />
                Ver todas as conversas do escritório
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {atual === "documentos" ? <CartaoDocumentos documentos={documentos} voltar={`/clientes/${id}?aba=documentos`} clienteId={id} papel={sessao.papel} timeZone={timeZone} /> : null}
    </div>
  );
}

function Item({ rotulo, valor, className, mono, Icone }: { rotulo: string; valor: string | null | undefined; className?: string; mono?: boolean; Icone?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase">{rotulo}</dt>
      <dd className={cn("mt-0.5 flex items-start gap-1.5 text-sm leading-snug font-medium whitespace-pre-line text-zinc-900", mono && valor ? "font-mono text-[13px]" : undefined)}>
        {Icone && valor ? <Icone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden /> : null}
        {valor || <span className="font-normal text-zinc-400">—</span>}
      </dd>
    </div>
  );
}

/** "Fato" do cabeçalho: ícone + valor em linha. */
function Fato({ Icone, rotulo, valor, vazio, mono }: { Icone: React.ComponentType<{ className?: string }>; rotulo: string; valor: string | null; vazio: string; mono?: boolean }) {
  return (
    <div className="inline-flex min-w-0 max-w-full items-center gap-1.5">
      <Icone className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
      <dt className="sr-only">{rotulo}</dt>
      <dd className={cn("truncate", valor ? "font-semibold text-zinc-800" : "text-zinc-400", mono && valor ? "font-mono text-xs" : undefined)} title={valor ?? undefined}>
        {valor ?? vazio}
      </dd>
    </div>
  );
}

/** Lista vazia dentro de um cartão, com ação opcional ao lado. */
function VazioCartao({ texto, children }: { texto: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-4 text-sm text-zinc-500">
      <span>{texto}</span>
      {children}
    </div>
  );
}
