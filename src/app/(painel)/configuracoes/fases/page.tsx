import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarFases } from "@/server/processos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Campo, GrupoCampos, Input, Select } from "@/components/ui/input";
import { Button, classesBotao } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, Vazio } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { NavegacaoConfiguracoes } from "../navegacao";
import { criarFase, criarFasesPadrao, editarFase, excluirFase } from "./actions";

export const metadata = { title: "Fases do kanban" };
export const dynamic = "force-dynamic";

export default async function PaginaFases({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string; editar?: string }> }) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") redirect("/configuracoes");
  const { erro, ok, editar } = await searchParams;
  const supabase = await criarClienteServidor();
  const fases = await listarFases(supabase, sessao.escritorioId, { somenteAtivas: false });
  const emEdicao = fases.find((f) => f.id === editar) ?? null;

  // Quantos processos em cada fase
  const { data: contagens } = await supabase.from("processos").select("fase_id").eq("escritorio_id", sessao.escritorioId).not("fase_id", "is", null);
  const porFase = new Map<string, number>();
  for (const p of contagens ?? []) porFase.set(p.fase_id as string, (porFase.get(p.fase_id as string) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Configurações</h1>
          <p className="text-sm text-zinc-500">Colunas do quadro de processos e os códigos TPU que sugerem a fase automaticamente.</p>
        </div>
        <a href="#formulario" className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
          Nova fase
        </a>
      </div>
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes/fases" />
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Fases do kanban</CardTitle>
          <CardDescription>Colunas do quadro de processos. Os códigos TPU de movimento servem para o sistema sugerir a fase quando o DataJud traz uma movimentação (a confirmação continua humana).</CardDescription>
        </CardHeader>
        <CardContent>
          {fases.length === 0 ? (
            <Vazio
              titulo="Nenhuma fase cadastrada."
              descricao="Comece pelas fases padrão do escritório e ajuste depois, ou crie a primeira fase no formulário abaixo."
              acao={
                <form action={criarFasesPadrao}>
                  <Button type="submit" variante="secundaria">
                    Criar fases padrão
                  </Button>
                </form>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Ordem</TH>
                  <TH>Fase</TH>
                  <TH>Códigos TPU</TH>
                  <TH>Processos</TH>
                  <TH>Ações</TH>
                </TR>
              </THead>
              <TBody>
                {fases.map((f) => (
                  <TR key={f.id} className={f.ativa ? "" : "opacity-60"}>
                    <TD className="text-zinc-500 tabular-nums">{f.ordem}</TD>
                    <TD className="font-semibold text-zinc-950">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {f.cor ? <span className="inline-block h-3 w-3 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: f.cor }} /> : null}
                        {f.nome}
                        {!f.ativa ? <Badge tom="neutro">inativa</Badge> : null}
                      </span>
                    </TD>
                    <TD className="font-mono text-xs text-zinc-600">{f.codigos_tpu?.length ? f.codigos_tpu.join(", ") : "—"}</TD>
                    <TD className="tabular-nums">{porFase.get(f.id) ?? 0}</TD>
                    <TD>
                      <div className="flex gap-1">
                        <a href={`/configuracoes/fases?editar=${f.id}#formulario`} className={classesBotao({ variante: "fantasma", tamanho: "sm", className: "text-xs" })}>
                          Editar
                        </a>
                        <form action={excluirFase.bind(null, f.id)}>
                          <Button type="submit" variante="fantasma" tamanho="sm" className="text-xs text-red-700 hover:bg-red-50 hover:text-red-800">
                            Excluir
                          </Button>
                        </form>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card id="formulario">
        <CardHeader>
          <CardTitle>{emEdicao ? `Editar: ${emEdicao.nome}` : "Nova fase"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={emEdicao ? editarFase.bind(null, emEdicao.id) : criarFase} className="flex flex-col gap-6">
            <GrupoCampos titulo="Fase" colunas={2}>
              <Campo label="Nome">
                <Input name="nome" required defaultValue={emEdicao?.nome ?? ""} />
              </Campo>
              <Campo label="Ordem" dica="Posição da coluna no quadro, da esquerda para a direita.">
                <Input name="ordem" type="number" min={1} defaultValue={String(emEdicao?.ordem ?? fases.length + 1)} />
              </Campo>
              <Campo label="Cor">
                <Input name="cor" type="color" defaultValue={emEdicao?.cor ?? "#64748b"} className="h-10 w-20 cursor-pointer p-1" />
              </Campo>
              <Campo label="Situação">
                <Select name="ativa" defaultValue={emEdicao?.ativa === false ? "0" : "1"}>
                  <option value="1">Ativa</option>
                  <option value="0">Inativa</option>
                </Select>
              </Campo>
            </GrupoCampos>
            <GrupoCampos titulo="Sugestão automática" colunas={1}>
              <Campo label="Códigos TPU de movimento (separados por vírgula)" dica="Quando o DataJud trouxer um movimento com um destes códigos, o sistema sugere esta fase.">
                <Input name="codigos_tpu" defaultValue={(emEdicao?.codigos_tpu ?? []).join(", ")} placeholder="Ex.: 193, 196, 198" />
              </Campo>
            </GrupoCampos>
            <div className="flex flex-wrap justify-end gap-2">
              {emEdicao ? (
                <a href="/configuracoes/fases" className={classesBotao({ variante: "contorno" })}>
                  Cancelar
                </a>
              ) : null}
              <Button type="submit">{emEdicao ? "Salvar" : "Criar fase"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
