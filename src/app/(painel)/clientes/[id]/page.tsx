import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarDocumento, podeEditarProcesso, POLOS, STATUS_PROCESSO } from "@/server/processos";
import { listarMembros, mapaNomes } from "@/server/equipe";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CamposCliente, type ClienteFormulario } from "../formulario-cliente";
import { atualizarCliente } from "../actions";
import { CartaoDocumentos } from "@/components/dominio/CartaoDocumentos";
import { listarDocumentos } from "@/server/documentos";
import { CartaoContatos, type ContatoCliente } from "./cartao-contatos";

export const metadata = { title: "Cliente" };
export const dynamic = "force-dynamic";

export default async function PaginaCliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string; editar?: string }> }) {
  const sessao = await exigirSessao();
  const { id } = await params;
  const { erro, ok, editar } = await searchParams;
  const supabase = await criarClienteServidor();

  const { data: cliente } = await supabase.from("clientes").select("id, tipo_pessoa, nome, cpf_cnpj, email, telefone_e164, endereco, observacoes, ativo, criado_em").eq("id", id).eq("escritorio_id", sessao.escritorioId).maybeSingle();
  if (!cliente) notFound();

  const [{ data: partes }, membros, documentos, { data: escritorio }] = await Promise.all([
    supabase.from("processo_partes").select("processo_id, polo, processos(id, numero_cnj_mascara, status, segredo_justica, responsavel_id)").eq("cliente_id", id).eq("eh_cliente", true),
    listarMembros(supabase, sessao.escritorioId, { somenteAtivos: false }),
    listarDocumentos(supabase, { clienteId: id }).catch(() => []),
    supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).maybeSingle(),
  ]);
  const { data: contatosData } = await supabase.from("clientes_contatos").select("id, telefone_e164, verificado_em, opt_in_em, opt_out_em").eq("cliente_id", id).eq("ativo", true).order("criado_em");
  const timeZone = (escritorio?.timezone as string | undefined) ?? "America/Cuiaba";
  const nomes = mapaNomes(membros);
  type ParteProcesso = { processo_id: string; polo: string; processos: { id: string; numero_cnj_mascara: string | null; status: string; segredo_justica: boolean; responsavel_id: string | null } | null };
  const processos = ((partes ?? []) as unknown as ParteProcesso[]).filter((p) => p.processos);
  const podeEditar = podeEditarProcesso(sessao.papel);
  const modoEdicao = editar === "1" && podeEditar;
  const dados = cliente as unknown as ClienteFormulario & { id: string; criado_em: string };
  const end = dados.endereco ?? {};
  const enderecoTexto = [end.logradouro, end.numero, end.complemento, end.bairro, end.cidade && end.uf ? `${end.cidade}/${end.uf}` : end.cidade ?? end.uf, end.cep].filter(Boolean).join(", ");

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
        <div className="flex gap-2">
          {podeEditar ? (
            <>
              <Link href={modoEdicao ? `/clientes/${id}` : `/clientes/${id}?editar=1`} className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                {modoEdicao ? "Fechar edição" : "Editar"}
              </Link>
              <Link href={`/processos/novo?cliente=${id}`} className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900">
                Novo processo
              </Link>
            </>
          ) : null}
        </div>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

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

      <CartaoContatos clienteId={id} contatos={(contatosData ?? []) as ContatoCliente[]} podeGerir={sessao.papel === "socio" || sessao.papel === "advogado"} />
      <CartaoDocumentos documentos={documentos} voltar={`/clientes/${id}`} clienteId={id} papel={sessao.papel} timeZone={timeZone} />
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
