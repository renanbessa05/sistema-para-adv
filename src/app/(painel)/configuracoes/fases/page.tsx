import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarFases } from "@/server/processos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Campo, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
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
      <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Configurações</h1>
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
            <div className="flex flex-col items-start gap-2 text-sm">
              <p className="text-zinc-500">Nenhuma fase cadastrada.</p>
              <form action={criarFasesPadrao}>
                <Button type="submit" variante="secundaria">
                  Criar fases padrão
                </Button>
              </form>
            </div>
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
                    <TD>{f.ordem}</TD>
                    <TD>
                      <span className="inline-flex items-center gap-2">
                        {f.cor ? <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: f.cor }} /> : null}
                        {f.nome}
                        {!f.ativa ? <Badge tom="neutro">inativa</Badge> : null}
                      </span>
                    </TD>
                    <TD className="font-mono text-xs">{f.codigos_tpu?.length ? f.codigos_tpu.join(", ") : "—"}</TD>
                    <TD>{porFase.get(f.id) ?? 0}</TD>
                    <TD>
                      <div className="flex gap-1">
                        <a href={`/configuracoes/fases?editar=${f.id}#formulario`} className="inline-flex h-8 items-center rounded-md px-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">
                          Editar
                        </a>
                        <form action={excluirFase.bind(null, f.id)}>
                          <Button type="submit" variante="fantasma" tamanho="sm" className="text-xs text-red-700">
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
          <form action={emEdicao ? editarFase.bind(null, emEdicao.id) : criarFase} className="grid gap-3 sm:grid-cols-4">
            <Campo label="Nome" className="sm:col-span-2">
              <Input name="nome" required defaultValue={emEdicao?.nome ?? ""} />
            </Campo>
            <Campo label="Ordem">
              <Input name="ordem" type="number" min={1} defaultValue={String(emEdicao?.ordem ?? fases.length + 1)} />
            </Campo>
            <Campo label="Cor">
              <Input name="cor" type="color" defaultValue={emEdicao?.cor ?? "#64748b"} className="h-9 p-1" />
            </Campo>
            <Campo label="Códigos TPU de movimento (separados por vírgula)" className="sm:col-span-3">
              <Input name="codigos_tpu" defaultValue={(emEdicao?.codigos_tpu ?? []).join(", ")} placeholder="Ex.: 193, 196, 198" />
            </Campo>
            <Campo label="Situação">
              <Select name="ativa" defaultValue={emEdicao?.ativa === false ? "0" : "1"}>
                <option value="1">Ativa</option>
                <option value="0">Inativa</option>
              </Select>
            </Campo>
            <div className="flex justify-end gap-2 sm:col-span-4">
              {emEdicao ? (
                <a href="/configuracoes/fases" className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
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
