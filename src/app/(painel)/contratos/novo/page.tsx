import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { BotaoEnviar } from "@/components/ui/BotaoEnviar";
import { classesBotao } from "@/components/ui/button";
import { Campo, GrupoCampos, Input, Select, Textarea } from "@/components/ui/input";
import { novoContratoAction } from "../actions";

export const metadata = { title: "Novo contrato" };
export const dynamic = "force-dynamic";

export default async function PaginaNovoContrato({ searchParams }: { searchParams: Promise<{ erro?: string; cliente?: string; processo?: string }> }) {
  const sessao = await exigirSessao();
  const { erro, cliente, processo } = await searchParams;
  const supabase = await criarClienteServidor();
  const [{ data: clientes }, { data: processos }] = await Promise.all([
    supabase.from("clientes").select("id, nome").eq("escritorio_id", sessao.escritorioId).eq("ativo", true).order("nome").limit(1000),
    supabase.from("processos").select("id, numero_cnj_mascara").in("status", ["ativo", "suspenso"]).order("atualizado_em", { ascending: false }).limit(500),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="min-w-0">
        <Link href="/contratos" className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-500 hover:text-marca-700">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Contratos
        </Link>
        <h1 className="mt-1 text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Novo contrato: entrada do caso</h1>
        <p className="text-sm text-zinc-500">As duas perguntas de abertura da skill (demanda em curso? qual polo?) e o relato. A IA diagnostica; o cálculo e a modalidade vêm em seguida para você confirmar.</p>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Etapa 0: abertura</CardTitle>
          <CardDescription>Cliente precisa estar cadastrado em Clientes. Processo é opcional (demanda em curso).</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={novoContratoAction} className="flex flex-col gap-6">
            <GrupoCampos titulo="Quem e qual processo" colunas={2}>
              <Campo label="Cliente">
                <Select name="cliente_id" defaultValue={cliente ?? ""} required>
                  <option value="">Escolha…</option>
                  {(clientes ?? []).map((c) => (
                    <option key={c.id as string} value={c.id as string}>
                      {c.nome as string}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Processo (se já existe)" dica="Deixe em branco quando o escritório vai ajuizar.">
                <Select name="processo_id" defaultValue={processo ?? ""} className="font-mono text-[13px]">
                  <option value="">Nenhum (nós iniciaremos)</option>
                  {(processos ?? []).map((p) => (
                    <option key={p.id as string} value={p.id as string}>
                      {(p.numero_cnj_mascara as string | null) ?? "sem número"}
                    </option>
                  ))}
                </Select>
              </Campo>
            </GrupoCampos>

            <GrupoCampos titulo="As duas perguntas de abertura" colunas={2}>
              <Campo label="Já existe demanda em curso?">
                <Select name="demanda_em_curso" defaultValue={processo ? "sim" : "nao"}>
                  <option value="nao">Não, nós iniciaremos</option>
                  <option value="sim">Sim, demanda em curso</option>
                </Select>
              </Campo>
              <Campo label="Via">
                <Select name="via" defaultValue="judicial">
                  <option value="judicial">Judicial</option>
                  <option value="extrajudicial">Extrajudicial</option>
                </Select>
              </Campo>
              <Campo label="Polo que representaremos" className="sm:col-span-2" dica="Ex.: autor/requerente, réu/requerido, exequente, executado, terceiro interessado, assistente.">
                <Input name="polo" placeholder="autor/requerente, réu/requerido, exequente, executado, terceiro interessado, assistente" required />
              </Campo>
            </GrupoCampos>

            <GrupoCampos titulo="Relato" descricao="Quanto mais completo, melhor o diagnóstico e menos lacunas nos documentos." colunas={1}>
              <Campo label="Relato do caso">
                <Textarea name="relato" rows={8} placeholder="O que aconteceu, o que o cliente quer, valores envolvidos, documentos que tem, urgência, parte contrária, comarca…" required minLength={20} className="min-h-48" />
              </Campo>
            </GrupoCampos>

            <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-4">
              <Link href="/contratos" className={classesBotao({ variante: "contorno" })}>
                Cancelar
              </Link>
              <BotaoEnviar rotuloEnviando="Diagnosticando… pode levar um minuto">
                <Sparkles aria-hidden />
                Diagnosticar com a IA
              </BotaoEnviar>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
