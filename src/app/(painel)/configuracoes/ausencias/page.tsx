import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMembros, mapaNomes, membrosComUsuario } from "@/server/equipe";
import { hojeNoFuso } from "@/lib/prazos";
import { formatarData } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Campo, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { NavegacaoConfiguracoes } from "../navegacao";
import { criarAusencia, editarAusencia, excluirAusencia } from "./actions";

export const metadata = { title: "Ausências" };
export const dynamic = "force-dynamic";

const TIPO: Record<string, string> = { ferias: "Férias", licenca: "Licença", outro: "Outro" };

type Ausencia = { id: string; usuario_id: string; inicio: string; fim: string; tipo: string; substituto_id: string | null; motivo: string | null };

export default async function PaginaAusencias({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string; editar?: string; passadas?: string }> }) {
  const sessao = await exigirSessao();
  const { erro, ok, editar, passadas } = await searchParams;
  const supabase = await criarClienteServidor();
  const gerencia = sessao.papel === "socio" || sessao.papel === "administrativo";

  const [{ data: escritorio }, membros] = await Promise.all([supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).maybeSingle(), listarMembros(supabase, sessao.escritorioId)]);
  const hoje = hojeNoFuso((escritorio?.timezone as string | undefined) ?? "America/Cuiaba");
  let consulta = supabase.from("ausencias").select("id, usuario_id, inicio, fim, tipo, substituto_id, motivo").eq("escritorio_id", sessao.escritorioId).order("inicio", { ascending: false });
  if (passadas !== "1") consulta = consulta.gte("fim", hoje);
  const { data } = await consulta;
  const ausencias = (data ?? []) as Ausencia[];
  const nomes = mapaNomes(membros);
  const emEdicao = ausencias.find((a) => a.id === editar) ?? null;
  const pessoas = membrosComUsuario(membros);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Configurações</h1>
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes/ausencias" />
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Ausências</CardTitle>
          <CardDescription>
            {gerencia ? "Férias e licenças da equipe. " : "Suas férias e licenças. "}
            Durante a ausência, as notificações vão para o substituto (ou para os sócios, se não houver).{" "}
            <a href={passadas === "1" ? "/configuracoes/ausencias" : "/configuracoes/ausencias?passadas=1"} className="underline">
              {passadas === "1" ? "Esconder passadas" : "Mostrar passadas"}
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ausencias.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma ausência {passadas === "1" ? "cadastrada" : "em andamento ou futura"}.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Pessoa</TH>
                  <TH>Período</TH>
                  <TH>Tipo</TH>
                  <TH>Substituto</TH>
                  <TH>Motivo</TH>
                  <TH>Ações</TH>
                </TR>
              </THead>
              <TBody>
                {ausencias.map((a) => {
                  const emCurso = a.inicio <= hoje && a.fim >= hoje;
                  const minha = a.usuario_id === sessao.usuarioId;
                  return (
                    <TR key={a.id}>
                      <TD>
                        {nomes.get(a.usuario_id) ?? "membro"} {emCurso ? <Badge tom="alerta">em curso</Badge> : null}
                      </TD>
                      <TD className="whitespace-nowrap">
                        {formatarData(a.inicio)} – {formatarData(a.fim)}
                      </TD>
                      <TD>{TIPO[a.tipo] ?? a.tipo}</TD>
                      <TD>{a.substituto_id ? nomes.get(a.substituto_id) ?? "membro" : "—"}</TD>
                      <TD className="text-xs">{a.motivo ?? "—"}</TD>
                      <TD>
                        {minha || gerencia ? (
                          <div className="flex gap-1">
                            <a href={`/configuracoes/ausencias?editar=${a.id}${passadas === "1" ? "&passadas=1" : ""}#formulario`} className="inline-flex h-8 items-center rounded-md px-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">
                              Editar
                            </a>
                            <form action={excluirAusencia.bind(null, a.id)}>
                              <Button type="submit" variante="fantasma" tamanho="sm" className="text-xs text-red-700">
                                Excluir
                              </Button>
                            </form>
                          </div>
                        ) : null}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card id="formulario">
        <CardHeader>
          <CardTitle>{emEdicao ? "Editar ausência" : "Nova ausência"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={emEdicao ? editarAusencia.bind(null, emEdicao.id) : criarAusencia} className="grid gap-3 sm:grid-cols-3">
            <Campo label="Pessoa">
              {gerencia ? (
                <Select name="usuario_id" defaultValue={emEdicao?.usuario_id ?? sessao.usuarioId}>
                  {pessoas.map((m) => (
                    <option key={m.usuario_id} value={m.usuario_id}>
                      {m.nome_completo}
                      {m.usuario_id === sessao.usuarioId ? " (eu)" : ""}
                    </option>
                  ))}
                </Select>
              ) : (
                <>
                  <input type="hidden" name="usuario_id" value={sessao.usuarioId} />
                  <Input value={sessao.nome} disabled readOnly />
                </>
              )}
            </Campo>
            <Campo label="Início">
              <Input name="inicio" type="date" required defaultValue={emEdicao?.inicio ?? ""} />
            </Campo>
            <Campo label="Fim">
              <Input name="fim" type="date" required defaultValue={emEdicao?.fim ?? ""} />
            </Campo>
            <Campo label="Tipo">
              <Select name="tipo" defaultValue={emEdicao?.tipo ?? "ferias"}>
                {Object.entries(TIPO).map(([v, r]) => (
                  <option key={v} value={v}>
                    {r}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Substituto (recebe as notificações)">
              <Select name="substituto_id" defaultValue={emEdicao?.substituto_id ?? ""}>
                <option value="">Sócios (padrão)</option>
                {pessoas.map((m) => (
                  <option key={m.usuario_id} value={m.usuario_id}>
                    {m.nome_completo}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Motivo (opcional)">
              <Input name="motivo" defaultValue={emEdicao?.motivo ?? ""} />
            </Campo>
            <div className="flex justify-end gap-2 sm:col-span-3">
              {emEdicao ? (
                <a href="/configuracoes/ausencias" className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                  Cancelar
                </a>
              ) : null}
              <Button type="submit">{emEdicao ? "Salvar" : "Cadastrar"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
