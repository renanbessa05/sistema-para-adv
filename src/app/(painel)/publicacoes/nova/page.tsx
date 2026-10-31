import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMembros, listarProcessosParaVinculo, mapaNomes } from "@/server/publicacoes";
import { TIPOS_PUBLICACAO } from "@/lib/ia/schemas/classificacao";
import { ROTULO_TIPO_PUBLICACAO } from "@/components/dominio/CaixaPublicacoes";
import { ROTULO_CONTAGEM } from "@/components/dominio/CartaoPrazo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select, Textarea } from "@/components/ui/input";
import { lancarPublicacaoManual } from "./actions";

export const metadata = { title: "Lançar publicação" };
export const dynamic = "force-dynamic";

type Ato = { id: string; nome: string; dias: number; contagem: string };

export default async function PaginaNovaPublicacao({ searchParams }: { searchParams: Promise<{ erro?: string; cnj?: string; processo?: string }> }) {
  const sessao = await exigirSessao();
  if (sessao.papel === "estagiario") redirect("/publicacoes?erro=" + encodeURIComponent("Estagiário não lança publicação manual."));
  const { erro, cnj, processo } = await searchParams;
  const supabase = await criarClienteServidor();
  const [processos, membros, { data: atosBrutos }] = await Promise.all([listarProcessosParaVinculo(supabase), listarMembros(supabase), supabase.from("atos_prazo").select("id, nome, dias, contagem").eq("ativo", true).order("nome")]);
  const nomes = mapaNomes(membros);
  const atos = (atosBrutos ?? []) as Ato[];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-zinc-500">
          <Link href="/publicacoes" className="hover:underline">
            Publicações
          </Link>{" "}
          / lançamento manual
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Lançar publicação</h1>
        <p className="text-sm text-zinc-500">Intimação vista no PJe ou recebida por e-mail. Nasce como «nova»; o prazo, se marcado, nasce sugerido e precisa de confirmação.</p>
      </div>

      {erro ? <Alert tom="perigo">{erro}</Alert> : null}

      <form action={lancarPublicacaoManual} className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Comunicação</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Campo label="Fonte">
              <Select name="fonte" defaultValue="pje_manual" required>
                <option value="pje_manual">PJe (consulta manual)</option>
                <option value="email_manual">E-mail</option>
              </Select>
            </Campo>
            <Campo label="Tipo">
              <Select name="tipo" defaultValue="intimacao" required>
                {TIPOS_PUBLICACAO.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO_PUBLICACAO[t] ?? t}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Processo da carteira">
              <Select name="processo_id" defaultValue={processo ?? ""}>
                <option value="">— não está na carteira / informar número —</option>
                {processos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.numero_cnj_mascara ?? p.numero_cnj}
                    {p.responsavel_id && nomes.get(p.responsavel_id) ? ` · ${nomes.get(p.responsavel_id)}` : ""}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="ou número CNJ">
              <Input name="numero_cnj" placeholder="0000000-00.0000.8.11.0000" defaultValue={cnj ?? ""} />
            </Campo>
            <Campo label="A data informada é">
              <Select name="tipo_data" defaultValue="disponibilizacao" required>
                <option value="disponibilizacao">Data de disponibilização (DJEN/PJe)</option>
                <option value="ciencia">Data de ciência (intimação pessoal, e-mail)</option>
              </Select>
            </Campo>
            <Campo label="Data">
              <Input name="data" type="date" required />
            </Campo>
            <Campo label="Órgão (opcional)" className="sm:col-span-2">
              <Input name="orgao" placeholder="Ex.: 3ª Vara Cível de Cuiabá" />
            </Campo>
            <Campo label="Texto da comunicação (opcional)" className="sm:col-span-2">
              <Textarea name="texto" rows={8} placeholder="Cole aqui o teor da intimação. Fica restrito conforme o sigilo do processo." />
            </Campo>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prazo</CardTitle>
            <CardDescription>Só com processo na carteira e data de disponibilização. Contagem em dias úteis, sem dobro; ajuste ao confirmar.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="gera_prazo" className="h-4 w-4" />
              Gera prazo
            </label>
            <Campo label="Ato cadastrado">
              <Select name="ato_id" defaultValue="">
                <option value="">— ato livre (descrever abaixo) —</option>
                {atos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome} · {a.dias} {ROTULO_CONTAGEM[a.contagem] ?? a.contagem}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Ato (descrição livre)">
              <Input name="ato_descricao" placeholder="Ex.: manifestar sobre laudo" />
            </Campo>
            <Campo label="Dias (substitui o padrão do ato)">
              <Input name="dias" type="number" min={1} max={3650} inputMode="numeric" />
            </Campo>
            <div className="flex flex-col gap-2 pt-2">
              <Button type="submit">Lançar</Button>
              <Link href="/publicacoes" className="text-center text-sm text-zinc-500 hover:underline">
                Cancelar
              </Link>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
