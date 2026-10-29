import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMembros, listarTelefones, ROTULO_PAPEL } from "@/server/equipe";
import { formatarDataHora } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Campo, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { NavegacaoConfiguracoes } from "../navegacao";
import { alternarAtivoMembro, convidarMembro, editarMembro, reenviarConvite, removerTelefone } from "./actions";
import { FormularioTelefone } from "./telefone";

export const metadata = { title: "Equipe" };
export const dynamic = "force-dynamic";

export default async function PaginaEquipe({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string; aviso?: string; editar?: string }> }) {
  const sessao = await exigirSessao();
  const { erro, ok, aviso, editar } = await searchParams;
  const supabase = await criarClienteServidor();
  const socio = sessao.papel === "socio";
  const [membros, telefones, { data: escritorio }] = await Promise.all([listarMembros(supabase, sessao.escritorioId, { somenteAtivos: false }), listarTelefones(supabase, sessao.escritorioId), supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).maybeSingle()]);
  const timeZone = (escritorio?.timezone as string | undefined) ?? "America/Cuiaba";
  const telefonePor = new Map(telefones.filter((t) => t.principal).map((t) => [t.usuario_id, t]));
  for (const t of telefones) if (!telefonePor.has(t.usuario_id)) telefonePor.set(t.usuario_id, t);
  const meuTelefone = telefonePor.get(sessao.usuarioId) ?? null;
  const emEdicao = socio ? membros.find((m) => m.id === editar) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Configurações</h1>
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes/equipe" />
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      {aviso ? <Alert tom="alerta">{aviso}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Meu telefone do WhatsApp</CardTitle>
          <CardDescription>Só telefone verificado recebe alertas e pode conversar com o sistema. Verifique enviando o código pelo próprio WhatsApp.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {meuTelefone ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono">{meuTelefone.telefone_e164}</span>
              {meuTelefone.verificado_em ? <Badge tom="sucesso">verificado em {formatarDataHora(meuTelefone.verificado_em, timeZone)}</Badge> : <Badge tom="alerta">não verificado</Badge>}
              <form action={removerTelefone.bind(null, meuTelefone.id)}>
                <Button type="submit" variante="fantasma" tamanho="sm">
                  Remover
                </Button>
              </form>
            </div>
          ) : null}
          <FormularioTelefone telefoneAtual={meuTelefone?.telefone_e164 ?? null} telefoneId={meuTelefone?.id ?? null} verificado={Boolean(meuTelefone?.verificado_em)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Membros</CardTitle>
          <CardDescription>{socio ? "Convide por e-mail; o papel define o que a pessoa pode fazer (docs/regras/permissoes.md)." : "Lista da equipe. Convites e papéis são do sócio."}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Nome</TH>
                <TH>Papel</TH>
                <TH>OAB</TH>
                <TH>E-mail</TH>
                <TH>WhatsApp</TH>
                <TH>Situação</TH>
                {socio ? <TH>Ações</TH> : null}
              </TR>
            </THead>
            <TBody>
              {membros.map((m) => {
                const tel = m.usuario_id ? telefonePor.get(m.usuario_id) : null;
                return (
                  <TR key={m.id} className={m.ativo ? "" : "opacity-60"}>
                    <TD>
                      {m.nome_completo}
                      {m.nomes_alternativos?.length ? <span className="block text-xs text-zinc-500">também: {m.nomes_alternativos.join("; ")}</span> : null}
                    </TD>
                    <TD>
                      <Badge tom="contorno">{ROTULO_PAPEL[m.papel] ?? m.papel}</Badge>
                    </TD>
                    <TD className="whitespace-nowrap">{m.oab_numero ? `${m.oab_numero}${m.oab_sufixo ? `-${m.oab_sufixo}` : ""}/${m.oab_uf ?? "MT"}` : "—"}</TD>
                    <TD className="text-xs">{m.email_convite}</TD>
                    <TD>{tel ? tel.verificado_em ? <Badge tom="sucesso">verificado</Badge> : <Badge tom="alerta">pendente</Badge> : <span className="text-zinc-400">—</span>}</TD>
                    <TD>{!m.ativo ? <Badge tom="neutro">desativado</Badge> : m.usuario_id ? <Badge tom="sucesso">ativo</Badge> : <Badge tom="alerta">convite pendente</Badge>}</TD>
                    {socio ? (
                      <TD>
                        <div className="flex flex-wrap gap-1">
                          <a href={`/configuracoes/equipe?editar=${m.id}#editar`} className="inline-flex h-8 items-center rounded-md px-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">
                            Editar
                          </a>
                          {!m.usuario_id && m.ativo ? (
                            <form action={reenviarConvite.bind(null, m.id)}>
                              <Button type="submit" variante="fantasma" tamanho="sm" className="text-xs">
                                Reenviar convite
                              </Button>
                            </form>
                          ) : null}
                          {m.usuario_id !== sessao.usuarioId ? (
                            <form action={alternarAtivoMembro.bind(null, m.id, !m.ativo)}>
                              <Button type="submit" variante="fantasma" tamanho="sm" className="text-xs">
                                {m.ativo ? "Desativar" : "Reativar"}
                              </Button>
                            </form>
                          ) : null}
                          {tel && socio && m.usuario_id !== sessao.usuarioId ? (
                            <form action={removerTelefone.bind(null, tel.id)}>
                              <Button type="submit" variante="fantasma" tamanho="sm" className="text-xs">
                                Revogar telefone
                              </Button>
                            </form>
                          ) : null}
                        </div>
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {socio ? (
        <div className="grid gap-4 lg:grid-cols-2" id="editar">
          <Card>
            <CardHeader>
              <CardTitle>Convidar membro</CardTitle>
              <CardDescription>A pessoa recebe um e-mail para criar a senha. Advogado e sócio precisam de OAB para a captação do DJEN.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={convidarMembro} className="grid gap-3 sm:grid-cols-2">
                <Campo label="E-mail" className="sm:col-span-2">
                  <Input name="email" type="email" required />
                </Campo>
                <Campo label="Nome completo" className="sm:col-span-2">
                  <Input name="nome_completo" required />
                </Campo>
                <Campo label="Papel">
                  <Select name="papel" defaultValue="advogado">
                    {Object.entries(ROTULO_PAPEL).map(([v, r]) => (
                      <option key={v} value={v}>
                        {r}
                      </option>
                    ))}
                  </Select>
                </Campo>
                <div className="grid grid-cols-3 gap-2">
                  <Campo label="OAB nº">
                    <Input name="oab_numero" inputMode="numeric" />
                  </Campo>
                  <Campo label="UF">
                    <Input name="oab_uf" defaultValue="MT" maxLength={2} />
                  </Campo>
                  <Campo label="Sufixo">
                    <Input name="oab_sufixo" placeholder="A, B…" maxLength={2} />
                  </Campo>
                </div>
                <Campo label="Nomes alternativos (um por linha; como aparecem nas publicações)" className="sm:col-span-2">
                  <Textarea name="nomes_alternativos" rows={2} />
                </Campo>
                <div className="flex justify-end sm:col-span-2">
                  <Button type="submit">Enviar convite</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {emEdicao ? (
            <Card>
              <CardHeader>
                <CardTitle>Editar: {emEdicao.nome_completo}</CardTitle>
                <CardDescription>O e-mail não muda aqui (é a chave do convite).</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={editarMembro.bind(null, emEdicao.id)} className="grid gap-3 sm:grid-cols-2">
                  <Campo label="Nome completo" className="sm:col-span-2">
                    <Input name="nome_completo" required defaultValue={emEdicao.nome_completo} />
                  </Campo>
                  <Campo label="Papel">
                    <Select name="papel" defaultValue={emEdicao.papel}>
                      {Object.entries(ROTULO_PAPEL).map(([v, r]) => (
                        <option key={v} value={v}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  </Campo>
                  <div className="grid grid-cols-3 gap-2">
                    <Campo label="OAB nº">
                      <Input name="oab_numero" defaultValue={emEdicao.oab_numero ?? ""} inputMode="numeric" />
                    </Campo>
                    <Campo label="UF">
                      <Input name="oab_uf" defaultValue={emEdicao.oab_uf ?? "MT"} maxLength={2} />
                    </Campo>
                    <Campo label="Sufixo">
                      <Input name="oab_sufixo" defaultValue={emEdicao.oab_sufixo ?? ""} maxLength={2} />
                    </Campo>
                  </div>
                  <Campo label="Nomes alternativos (um por linha)" className="sm:col-span-2">
                    <Textarea name="nomes_alternativos" rows={2} defaultValue={(emEdicao.nomes_alternativos ?? []).join("\n")} />
                  </Campo>
                  <div className="flex justify-end gap-2 sm:col-span-2">
                    <a href="/configuracoes/equipe" className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                      Cancelar
                    </a>
                    <Button type="submit">Salvar</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
