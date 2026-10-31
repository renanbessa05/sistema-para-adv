import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMembros, listarProcessosParaVinculo, mapaNomes } from "@/server/publicacoes";
import { TIPOS_PUBLICACAO } from "@/lib/ia/schemas/classificacao";
import { ROTULO_TIPO_PUBLICACAO } from "@/components/dominio/CaixaPublicacoes";
import { ROTULO_CONTAGEM } from "@/components/dominio/CartaoPrazo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button, classesBotao } from "@/components/ui/button";
import { Campo, GrupoCampos, Input, Select, Textarea } from "@/components/ui/input";
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="min-w-0">
        <p className="text-[13px] text-zinc-500">
          <Link href="/publicacoes" className="font-semibold text-marca-600 hover:underline">
            Publicações
          </Link>
          <span className="mx-1.5 text-zinc-300">/</span>
          lançamento manual
        </p>
        <h1 className="mt-1 text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Lançar publicação</h1>
        <p className="mt-1 max-w-prose text-sm text-zinc-500">Intimação vista no PJe ou recebida por e-mail. Nasce como «nova»; o prazo, se marcado, nasce sugerido e precisa de confirmação.</p>
      </div>

      {erro ? <Alert tom="perigo">{erro}</Alert> : null}

      <form action={lancarPublicacaoManual} className="flex flex-col gap-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Comunicação</CardTitle>
              <CardDescription>De onde veio, a que processo pertence e quando foi disponibilizada.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <GrupoCampos titulo="Origem">
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
              </GrupoCampos>

              <GrupoCampos titulo="Processo" descricao="Escolha um da carteira ou informe o número; com número solto a publicação nasce «sem processo».">
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
                <Campo label="ou número CNJ" dica="Com ou sem máscara; o sistema normaliza.">
                  <Input name="numero_cnj" placeholder="0000000-00.0000.8.11.0000" defaultValue={cnj ?? ""} className="font-mono" />
                </Campo>
              </GrupoCampos>

              <GrupoCampos titulo="Data" descricao="A contagem do prazo parte desta data, conforme o tipo escolhido.">
                <Campo label="A data informada é">
                  <Select name="tipo_data" defaultValue="disponibilizacao" required>
                    <option value="disponibilizacao">Data de disponibilização (DJEN/PJe)</option>
                    <option value="ciencia">Data de ciência (intimação pessoal, e-mail)</option>
                  </Select>
                </Campo>
                <Campo label="Data">
                  <Input name="data" type="date" required />
                </Campo>
              </GrupoCampos>

              <GrupoCampos titulo="Conteúdo" colunas={1}>
                <Campo label="Órgão (opcional)">
                  <Input name="orgao" placeholder="Ex.: 3ª Vara Cível de Cuiabá" />
                </Campo>
                <Campo label="Texto da comunicação (opcional)" dica="Fica restrito conforme o sigilo do processo. É tratado como dado, nunca como instrução.">
                  <Textarea name="texto" rows={8} placeholder="Cole aqui o teor da intimação." className="min-h-40 leading-relaxed" />
                </Campo>
              </GrupoCampos>
            </CardContent>
          </Card>

          <Card className="self-start">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-marca-600" aria-hidden />
                Prazo
              </CardTitle>
              <CardDescription>Só com processo na carteira e data de disponibilização. Contagem em dias úteis, sem dobro; ajuste ao confirmar.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 px-3.5 py-3 text-sm transition-colors hover:border-marca-200 hover:bg-marca-50/40">
                <input type="checkbox" name="gera_prazo" className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 accent-marca-600" />
                <span className="min-w-0">
                  <span className="block font-semibold text-zinc-950">Gera prazo</span>
                  <span className="block text-xs text-zinc-500">Cria um prazo sugerido ligado a esta publicação.</span>
                </span>
              </label>
              <GrupoCampos colunas={1}>
                <Campo label="Ato cadastrado" dica="Traz a quantidade de dias padrão do ato.">
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
                  <Input name="dias" type="number" min={1} max={3650} inputMode="numeric" className="tabular-nums" />
                </Campo>
              </GrupoCampos>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link href="/publicacoes" className={classesBotao({ variante: "contorno" })}>
            Cancelar
          </Link>
          <Button type="submit">Lançar</Button>
        </div>
      </form>
    </div>
  );
}
