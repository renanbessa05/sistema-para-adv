import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ROTULO_AREA, ROTULO_TIPO_PECA } from "@/lib/ia/schemas/minutas";
import { NavegacaoConfiguracoes } from "../navegacao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select, Textarea } from "@/components/ui/input";
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
      <h1 className="text-xl font-semibold">Modelos de peça</h1>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Enviar modelo</CardTitle>
          <CardDescription>Um .docx do escritório por tipo de peça e área. O texto é extraído e entra como referência de estrutura na etapa de redação; o timbre dos documentos gerados continua vindo de Configurações → Documentos.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={novoModeloAction} className="grid gap-2 sm:grid-cols-4">
            <Campo label="Nome"><Input name="nome" required /></Campo>
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
            <Campo label="Arquivo .docx"><Input type="file" name="arquivo" accept=".docx" /></Campo>
            <Campo label="Ou cole a estrutura em texto" className="sm:col-span-4"><Textarea name="estrutura_md" rows={4} placeholder="Cabeçalho, seções e fórmulas que o escritório usa" /></Campo>
            <div className="flex justify-end sm:col-span-4">
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
            <p className="text-sm text-zinc-500">Nenhum modelo ainda. Sem modelo, a IA segue a forma padrão da skill do escritório.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {(modelos ?? []).map((m) => (
                <li key={m.id as string} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    {m.nome as string} · {m.tipo_peca ? ROTULO_TIPO_PECA[m.tipo_peca as keyof typeof ROTULO_TIPO_PECA] : "qualquer peça"} · {m.area ? ROTULO_AREA[m.area as keyof typeof ROTULO_AREA] : "qualquer área"} {m.ativo ? null : <Badge tom="neutro">inativo</Badge>}
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
