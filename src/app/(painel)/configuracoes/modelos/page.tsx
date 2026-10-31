import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ROTULO_AREA, ROTULO_TIPO_PECA } from "@/lib/ia/schemas/minutas";
import { NavegacaoConfiguracoes } from "../navegacao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Vazio } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Campo, GrupoCampos, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { desativarModeloAction, novoModeloAction } from "./actions";

export const metadata = { title: "Modelos de peça" };
export const dynamic = "force-dynamic";

export default async function PaginaModelos({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  if (!["socio", "advogado"].includes(sessao.papel)) redirect("/configuracoes");
  const { erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const { data: modelos } = await supabase.from("modelos_peca").select("id, tipo_peca, area, nome, documento_id, estrutura_md, ativo, criado_em").eq("escritorio_id", sessao.escritorioId).order("criado_em", { ascending: false });
  return (
    <div className="flex flex-col gap-4">
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes/modelos" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Modelos de peça</h1>
          <p className="text-sm text-zinc-500">Modelos .docx do escritório que a IA usa como referência de estrutura ao redigir.</p>
        </div>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Enviar modelo</CardTitle>
          <CardDescription>Um .docx do escritório por tipo de peça e área. O texto é extraído e entra como referência de estrutura na etapa de redação; o timbre dos documentos gerados continua vindo de Configurações → Documentos.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={novoModeloAction} className="flex flex-col gap-6">
            <GrupoCampos titulo="Modelo" colunas={3}>
              <Campo label="Nome">
                <Input name="nome" required />
              </Campo>
              <Campo label="Tipo de peça">
                <Select name="tipo_peca" defaultValue="">
                  <option value="">Qualquer</option>
                  {Object.entries(ROTULO_TIPO_PECA).map(([k, r]) => (
                    <option key={k} value={k}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Área">
                <Select name="area" defaultValue="">
                  <option value="">Qualquer</option>
                  {Object.entries(ROTULO_AREA).map(([k, r]) => (
                    <option key={k} value={k}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Campo>
            </GrupoCampos>
            <GrupoCampos titulo="Conteúdo" descricao="Envie o arquivo ou cole a estrutura em texto; um dos dois basta." colunas={1}>
              <Campo label="Arquivo .docx">
                <Input type="file" name="arquivo" accept=".docx" />
              </Campo>
              <Campo label="Ou cole a estrutura em texto">
                <Textarea name="estrutura_md" rows={4} placeholder="Cabeçalho, seções e fórmulas que o escritório usa" />
              </Campo>
            </GrupoCampos>
            <div className="flex justify-end">
              <Button type="submit">Salvar modelo</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Modelos cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {(modelos ?? []).length === 0 ? (
            <Vazio titulo="Nenhum modelo ainda." descricao="Sem modelo, a IA segue a forma padrão da skill do escritório." />
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {(modelos ?? []).map((m) => (
                <li key={m.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span className="font-semibold text-zinc-950">{m.nome as string}</span>
                    <span className="text-zinc-500">
                      · {m.tipo_peca ? ROTULO_TIPO_PECA[m.tipo_peca as keyof typeof ROTULO_TIPO_PECA] : "qualquer peça"} · {m.area ? ROTULO_AREA[m.area as keyof typeof ROTULO_AREA] : "qualquer área"}
                    </span>
                    {m.ativo ? null : <Badge tom="neutro">inativo</Badge>}
                  </span>
                  {m.ativo ? (
                    <form action={desativarModeloAction.bind(null, m.id as string)}>
                      <Button type="submit" variante="fantasma" tamanho="sm">
                        Desativar
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
