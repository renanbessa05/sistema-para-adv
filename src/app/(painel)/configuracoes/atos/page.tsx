import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Campo, GrupoCampos, Input, Select, Textarea } from "@/components/ui/input";
import { Button, classesBotao } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, Vazio } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { NavegacaoConfiguracoes } from "../navegacao";
import { alternarAtivoAto, criarAto, editarAto, excluirAto } from "./actions";

export const metadata = { title: "Atos e prazos" };
export const dynamic = "force-dynamic";

const CONTAGEM: Record<string, string> = { dias_uteis: "dias úteis", dias_corridos: "dias corridos", horas: "horas" };

type Ato = { id: string; nome: string; sinonimos: string[]; dias: number; contagem: string; dobro_padrao: boolean; dias_seguranca: number; fundamento_legal: string | null; ativo: boolean };

export default async function PaginaAtos({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string; editar?: string }> }) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") redirect("/configuracoes");
  const { erro, ok, editar } = await searchParams;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("atos_prazo").select("id, nome, sinonimos, dias, contagem, dobro_padrao, dias_seguranca, fundamento_legal, ativo").eq("escritorio_id", sessao.escritorioId).order("ativo", { ascending: false }).order("nome");
  const atos = (data ?? []) as Ato[];
  const emEdicao = atos.find((a) => a.id === editar) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Configurações</h1>
          <p className="text-sm text-zinc-500">Atos processuais com prazo padrão: o que o classificador reconhece e como o motor conta.</p>
        </div>
        <a href="#formulario" className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
          Novo ato
        </a>
      </div>
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes/atos" />
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Atos com prazo padrão</CardTitle>
          <CardDescription>O classificador casa a publicação com o ato pelo nome e sinônimos; o motor usa dias, contagem e dias de segurança (data interna). Fundamentos legais: confira antes de alterar.</CardDescription>
        </CardHeader>
        <CardContent>
          {atos.length === 0 ? (
            <Vazio titulo="Nenhum ato cadastrado" descricao="Cadastre o primeiro ato no formulário abaixo para o motor de prazos começar a sugerir datas." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Ato</TH>
                  <TH>Prazo</TH>
                  <TH>Dobro</TH>
                  <TH>Segurança</TH>
                  <TH>Fundamento</TH>
                  <TH>Ações</TH>
                </TR>
              </THead>
              <TBody>
                {atos.map((a) => (
                  <TR key={a.id} className={a.ativo ? "" : "opacity-60"}>
                    <TD className="min-w-48">
                      <span className="flex flex-wrap items-center gap-1.5 font-semibold text-zinc-950">
                        {a.nome} {!a.ativo ? <Badge tom="neutro">inativo</Badge> : null}
                      </span>
                      {a.sinonimos?.length ? <span className="block text-xs text-zinc-500">{a.sinonimos.join("; ")}</span> : null}
                    </TD>
                    <TD className="whitespace-nowrap tabular-nums">
                      {a.dias} {CONTAGEM[a.contagem] ?? a.contagem}
                    </TD>
                    <TD>{a.dobro_padrao ? "sim" : "não"}</TD>
                    <TD className="whitespace-nowrap tabular-nums">{a.dias_seguranca} dia(s) útil(eis)</TD>
                    <TD className="text-xs text-zinc-500">{a.fundamento_legal ?? "—"}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        <a href={`/configuracoes/atos?editar=${a.id}#formulario`} className={classesBotao({ variante: "fantasma", tamanho: "sm", className: "text-xs" })}>
                          Editar
                        </a>
                        <form action={alternarAtivoAto.bind(null, a.id, !a.ativo)}>
                          <Button type="submit" variante="fantasma" tamanho="sm" className="text-xs">
                            {a.ativo ? "Desativar" : "Reativar"}
                          </Button>
                        </form>
                        <form action={excluirAto.bind(null, a.id)}>
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
          <CardTitle>{emEdicao ? `Editar: ${emEdicao.nome}` : "Novo ato"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={emEdicao ? editarAto.bind(null, emEdicao.id) : criarAto} className="flex flex-col gap-6">
            <GrupoCampos titulo="Ato" colunas={3}>
              <Campo label="Nome" className="sm:col-span-2">
                <Input name="nome" required defaultValue={emEdicao?.nome ?? ""} />
              </Campo>
              <Campo label="Contagem">
                <Select name="contagem" defaultValue={emEdicao?.contagem ?? "dias_uteis"}>
                  {Object.entries(CONTAGEM).map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Campo>
            </GrupoCampos>
            <GrupoCampos titulo="Prazo" colunas={3}>
              <Campo label="Quantidade (dias/horas)">
                <Input name="dias" type="number" min={1} required defaultValue={String(emEdicao?.dias ?? 15)} />
              </Campo>
              <Campo label="Dias úteis de segurança" dica="Antecedência da data interna em relação à data fatal.">
                <Input name="dias_seguranca" type="number" min={0} defaultValue={String(emEdicao?.dias_seguranca ?? 2)} />
              </Campo>
              <div className="flex flex-col justify-end gap-1 text-sm">
                <label className="inline-flex h-10 items-center gap-2.5 text-zinc-800">
                  <input type="checkbox" name="dobro_padrao" defaultChecked={emEdicao?.dobro_padrao ?? false} className="h-4 w-4 rounded border-zinc-300 accent-marca-600" /> prazo em dobro por padrão
                </label>
                {emEdicao ? (
                  <label className="inline-flex items-center gap-2">
                    <input type="hidden" name="ativo" value={emEdicao.ativo ? "1" : "0"} />
                  </label>
                ) : null}
              </div>
            </GrupoCampos>
            <GrupoCampos titulo="Referência" colunas={1}>
              <Campo label="Fundamento legal">
                <Input name="fundamento_legal" defaultValue={emEdicao?.fundamento_legal ?? ""} placeholder="Ex.: CPC, art. 335" />
              </Campo>
              <Campo label="Sinônimos (um por linha; como o tribunal escreve)" dica="O classificador compara estes termos com o texto da publicação.">
                <Textarea name="sinonimos" rows={2} defaultValue={(emEdicao?.sinonimos ?? []).join("\n")} />
              </Campo>
            </GrupoCampos>
            <div className="flex flex-wrap justify-end gap-2">
              {emEdicao ? (
                <a href="/configuracoes/atos" className={classesBotao({ variante: "contorno" })}>
                  Cancelar
                </a>
              ) : null}
              <Button type="submit">{emEdicao ? "Salvar" : "Criar ato"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
