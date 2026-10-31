import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMembros, mapaNomes, membrosComUsuario } from "@/server/equipe";
import { hojeNoFuso } from "@/lib/prazos";
import { formatarData } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Campo, GrupoCampos, Input, Select } from "@/components/ui/input";
import { Button, classesBotao } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, Vazio } from "@/components/ui/alert";
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Configurações</h1>
          <p className="text-sm text-zinc-500">Férias e licenças, com quem recebe as notificações enquanto a pessoa estiver fora.</p>
        </div>
        <a href="#formulario" className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
          Nova ausência
        </a>
      </div>
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes/ausencias" />
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle>Ausências</CardTitle>
            <CardDescription>
              {gerencia ? "Férias e licenças da equipe. " : "Suas férias e licenças. "}
              Durante a ausência, as notificações vão para o substituto (ou para os sócios, se não houver).
            </CardDescription>
          </div>
          <a href={passadas === "1" ? "/configuracoes/ausencias" : "/configuracoes/ausencias?passadas=1"} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
            {passadas === "1" ? "Esconder passadas" : "Mostrar passadas"}
          </a>
        </CardHeader>
        <CardContent>
          {ausencias.length === 0 ? (
            <Vazio titulo={`Nenhuma ausência ${passadas === "1" ? "cadastrada" : "em andamento ou futura"}.`} descricao="Cadastre férias e licenças no formulário abaixo para as notificações serem redirecionadas." />
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
                      <TD className="font-semibold text-zinc-950">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {nomes.get(a.usuario_id) ?? "membro"} {emCurso ? <Badge tom="alerta">em curso</Badge> : null}
                        </span>
                      </TD>
                      <TD className="whitespace-nowrap tabular-nums">
                        {formatarData(a.inicio)} – {formatarData(a.fim)}
                      </TD>
                      <TD>{TIPO[a.tipo] ?? a.tipo}</TD>
                      <TD>{a.substituto_id ? nomes.get(a.substituto_id) ?? "membro" : "—"}</TD>
                      <TD className="text-xs text-zinc-500">{a.motivo ?? "—"}</TD>
                      <TD>
                        {minha || gerencia ? (
                          <div className="flex gap-1">
                            <a href={`/configuracoes/ausencias?editar=${a.id}${passadas === "1" ? "&passadas=1" : ""}#formulario`} className={classesBotao({ variante: "fantasma", tamanho: "sm", className: "text-xs" })}>
                              Editar
                            </a>
                            <form action={excluirAusencia.bind(null, a.id)}>
                              <Button type="submit" variante="fantasma" tamanho="sm" className="text-xs text-red-700 hover:bg-red-50 hover:text-red-800">
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
          <form action={emEdicao ? editarAusencia.bind(null, emEdicao.id) : criarAusencia} className="flex flex-col gap-6">
            <GrupoCampos titulo="Quem e quando" colunas={3}>
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
            </GrupoCampos>
            <GrupoCampos titulo="Detalhes" colunas={3}>
              <Campo label="Tipo">
                <Select name="tipo" defaultValue={emEdicao?.tipo ?? "ferias"}>
                  {Object.entries(TIPO).map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Substituto (recebe as notificações)" dica="Sem substituto, os alertas vão para os sócios.">
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
            </GrupoCampos>
            <div className="flex flex-wrap justify-end gap-2">
              {emEdicao ? (
                <a href="/configuracoes/ausencias" className={classesBotao({ variante: "contorno" })}>
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
