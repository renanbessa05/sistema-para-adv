import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarDocumento, formatarValor, podeEditarProcesso, POLOS, STATUS_PROCESSO } from "@/server/processos";
import { listarMembros, mapaNomes } from "@/server/equipe";
import { listarContratos, listarParcelas, ROTULO_STATUS_CONTRATO } from "@/server/contratos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CamposCliente, type ClienteFormulario } from "../formulario-cliente";
import { atualizarCliente } from "../actions";
import { CartaoDocumentos } from "@/components/dominio/CartaoDocumentos";
import { Abas, abaAtual } from "@/components/dominio/Abas";
import { listarDocumentos } from "@/server/documentos";
import { formatarData, formatarDataHora } from "@/lib/utils";
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
  const enderecoTexto = [end.logradouro, end.numero, end.complemento, end.bairro, end.cidade && end.uf ? `${end.cidade}/${end.uf}` : end.cidade ?? end.uf, end.cep].filter(Boolean).join(", ");
  const parcelasAbertas = parcelas.filter((p) => p.status === "pendente" || p.status === "atrasada");

  const abas = [
    { chave: "geral", rotulo: "Dados e contatos" },
    { chave: "processos", rotulo: "Processos", contagem: processos.length },
    { chave: "contratos", rotulo: "Contratos e parcelas", contagem: contratos.length, atencao: parcelasAbertas.some((p) => p.status === "atrasada") },
    ...(veAtendimento ? [{ chave: "conversas", rotulo: "Conversas", contagem: conversas.length }] : []),
    { chave: "documentos", rotulo: "Documentos", contagem: documentos.length },
  ];
  const atual = modoEdicao ? "geral" : abaAtual(abas, aba);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/clientes" className="text-sm text-zinc-500 hover:underline">
            ← Clientes
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            {dados.nome}
            <Badge tom="contorno">{dados.tipo_pessoa === "juridica" ? "Pessoa jurídica" : "Pessoa física"}</Badge>
            {dados.ativo === false ? <Badge tom="neutro">inativo</Badge> : null}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {podeEditar ? (
            <Link href={modoEdicao ? `/clientes/${id}` : `/clientes/${id}?editar=1`} className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
              {modoEdicao ? "Fechar edição" : "Editar"}
            </Link>
          ) : null}
          {veAtendimento ? (
            <Link href={`/contratos/novo?cliente=${id}`} className="inline-flex h-9 items-center rounded-md bg-marca-600 px-4 text-sm text-white shadow-sm hover:bg-marca-700">
              Entrada de caso (contrato)
            </Link>
          ) : null}
          {podeEditar ? (
            <Link href={`/processos/novo?cliente=${id}`} className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
              Novo processo
            </Link>
          ) : null}
        </div>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      <Abas base={`/clientes/${id}`} abas={abas} atual={atual} />

      {atual === "geral" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Dados</CardTitle>
            </CardHeader>
            <CardContent>
              {modoEdicao ? (
                <form action={atualizarCliente.bind(null, id)} className="flex flex-col gap-3">
                  <CamposCliente valor={dados} mostrarAtivo />
                  <div className="flex justify-end">
                    <Button type="submit">Salvar</Button>
                  </div>
                </form>
              ) : (
                <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                  <Item rotulo="CPF/CNPJ" valor={formatarDocumento(dados.cpf_cnpj)} />
                  <Item rotulo="E-mail" valor={dados.email} />
                  <Item rotulo="Telefone" valor={dados.telefone_e164} />
                  <Item rotulo="Endereço" valor={enderecoTexto} />
                  {dados.observacoes ? <Item rotulo="Observações" valor={dados.observacoes} className="sm:col-span-2" /> : null}
                </dl>
              )}
            </CardContent>
          </Card>
          <CartaoContatos clienteId={id} contatos={(contatosData ?? []) as ContatoCliente[]} podeGerir={veAtendimento} />
        </>
      ) : null}

      {atual === "processos" ? (
        <Card>
          <CardHeader>
            <CardTitle>Processos do cliente</CardTitle>
            <CardDescription>Processos em que esta pessoa figura como parte cliente.</CardDescription>
          </CardHeader>
          <CardContent>
            {processos.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhum processo vinculado.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Número</TH>
                    <TH>Polo</TH>
                    <TH>Responsável</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {processos.map((p) => (
                    <TR key={p.processo_id}>
                      <TD>
                        <Link href={`/processos/${p.processo_id}`} className="font-mono text-xs hover:underline">
                          {p.processos!.numero_cnj_mascara}
                        </Link>
                        {p.processos!.segredo_justica ? (
                          <Badge tom="perigo" className="ml-2">
                            sigiloso
                          </Badge>
                        ) : null}
                      </TD>
                      <TD>{POLOS[p.polo] ?? p.polo}</TD>
                      <TD>{p.processos!.responsavel_id ? nomes.get(p.processos!.responsavel_id) ?? "membro" : "—"}</TD>
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
            <CardContent>
              {contratos.length === 0 ? (
                <p className="text-sm text-zinc-500">Nenhum contrato. Comece pela entrada do caso.</p>
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
                        <TD className="whitespace-nowrap">
                          <Link href={`/contratos/${c.id}`} className="hover:underline">
                            {formatarDataHora(c.criado_em, timeZone)}
                          </Link>
                        </TD>
                        <TD>{c.modalidade ? ROTULO_MODALIDADE[c.modalidade] ?? c.modalidade : "—"}</TD>
                        <TD className="whitespace-nowrap">{c.valor_fixo ? formatarValor(c.valor_fixo) : c.percentual_exito ? `${c.percentual_exito}% de êxito` : "—"}</TD>
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
              <CardContent>
                {parcelas.length === 0 ? (
                  <p className="text-sm text-zinc-500">Sem parcelas (honorários à vista ou por êxito).</p>
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
                          <TD>{p.numero}</TD>
                          <TD className="whitespace-nowrap">{formatarData(p.vencimento)}</TD>
                          <TD>{formatarValor(p.valor)}</TD>
                          <TD>
                            <Badge tom={p.status === "paga" ? "sucesso" : p.status === "atrasada" ? "perigo" : p.status === "cancelada" ? "neutro" : "info"}>{p.status}</Badge>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
                <p className="mt-2 text-xs">
                  <Link href={`/contratos/${contratos[0].id}`} className="underline">
                    Marcar parcelas no contrato
                  </Link>
                </p>
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
          <CardContent>
            {conversas.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhuma conversa com este cliente.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                {conversas.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                    <Link href={`/atendimento?conversa=${c.id}`} className="hover:underline">
                      {c.telefone_e164}
                    </Link>
                    <span className="flex items-center gap-2 whitespace-nowrap text-xs text-zinc-500">
                      <Badge tom={c.aberta ? "info" : "neutro"}>{c.aberta ? "aberta" : "encerrada"}</Badge>
                      {c.ultima_mensagem_recebida_em ? formatarDataHora(c.ultima_mensagem_recebida_em, timeZone) : "sem mensagens"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs">
              <Link href="/atendimento" className="underline">
                Ver todas as conversas do escritório
              </Link>
            </p>
          </CardContent>
        </Card>
      ) : null}

      {atual === "documentos" ? <CartaoDocumentos documentos={documentos} voltar={`/clientes/${id}?aba=documentos`} clienteId={id} papel={sessao.papel} timeZone={timeZone} /> : null}
    </div>
  );
}

function Item({ rotulo, valor, className }: { rotulo: string; valor: string | null | undefined; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{rotulo}</dt>
      <dd className="whitespace-pre-line">{valor || <span className="text-zinc-400">—</span>}</dd>
    </div>
  );
}
