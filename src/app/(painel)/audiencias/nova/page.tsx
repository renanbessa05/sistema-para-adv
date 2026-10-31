import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TIPOS_AUDIENCIA } from "@/server/audiencias";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button, classesBotao } from "@/components/ui/button";
import { Campo, GrupoCampos, Input, Select, Textarea } from "@/components/ui/input";
import { novaAudienciaAction } from "../actions";

export const metadata = { title: "Nova audiência" };
export const dynamic = "force-dynamic";

export default async function PaginaNovaAudiencia({ searchParams }: { searchParams: Promise<{ erro?: string; processo?: string }> }) {
  const sessao = await exigirSessao();
  const { erro, processo } = await searchParams;
  if (!["socio", "advogado"].includes(sessao.papel)) return <Alert tom="perigo">Apenas advogado ou sócio agenda audiência.</Alert>;
  const supabase = await criarClienteServidor();
  const [{ data: processos }, { data: membros }] = await Promise.all([
    supabase.from("processos").select("id, numero_cnj_mascara").order("atualizado_em", { ascending: false }).limit(300),
    supabase.from("escritorio_membros").select("usuario_id, nome_completo").not("usuario_id", "is", null).eq("ativo", true).order("nome_completo"),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div className="min-w-0">
        <p className="text-[13px] text-zinc-500">
          <Link href="/audiencias" className="font-semibold text-marca-600 hover:underline">
            Audiências
          </Link>
          <span className="mx-1.5 text-zinc-300">/</span>
          nova
        </p>
        <h1 className="mt-1 text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Nova audiência</h1>
        <p className="mt-1 text-sm text-zinc-500">O horário é o do escritório (Cuiabá, por padrão). O alerta sai no dia útil anterior, às 08h.</p>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      <form action={novaAudienciaAction} className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Dados da audiência</CardTitle>
            <CardDescription>Processo, tipo e quando. Local ou link ajudam quem vai comparecer.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <GrupoCampos titulo="Processo e tipo">
              <Campo label="Processo">
                <Select name="processo_id" required defaultValue={processo ?? ""} className="font-mono text-xs">
                  <option value="" disabled>
                    Escolha o processo
                  </option>
                  {(processos ?? []).map((p) => (
                    <option key={p.id as string} value={p.id as string}>
                      {(p.numero_cnj_mascara as string | null) ?? "sem número"}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Tipo">
                <Select name="tipo" defaultValue="instrucao" className="capitalize">
                  {TIPOS_AUDIENCIA.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </Select>
              </Campo>
            </GrupoCampos>

            <GrupoCampos titulo="Quando e onde">
              <Campo label="Data e hora" dica="Horário local do escritório.">
                <Input name="data_hora" type="datetime-local" required className="tabular-nums" />
              </Campo>
              <Campo label="Modalidade">
                <Select name="modalidade" defaultValue="presencial" className="capitalize">
                  <option value="presencial">presencial</option>
                  <option value="virtual">virtual</option>
                </Select>
              </Campo>
              <Campo label="Local ou link" className="sm:col-span-2">
                <Input name="local_ou_link" placeholder="Fórum, sala ou link da videoconferência" />
              </Campo>
            </GrupoCampos>

            <GrupoCampos titulo="Responsável e observações" colunas={1}>
              <Campo label="Responsável" dica="Recebe o alerta de véspera junto com os sócios.">
                <Select name="responsavel_id" defaultValue="">
                  <option value="">Sem responsável definido</option>
                  {(membros ?? []).map((m) => (
                    <option key={m.usuario_id as string} value={m.usuario_id as string}>
                      {m.nome_completo as string}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Observações">
                <Textarea name="observacoes" rows={3} className="min-h-24" />
              </Campo>
            </GrupoCampos>
          </CardContent>
        </Card>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link href="/audiencias" className={classesBotao({ variante: "contorno" })}>
            Cancelar
          </Link>
          <Button type="submit">Agendar</Button>
        </div>
      </form>
    </div>
  );
}
