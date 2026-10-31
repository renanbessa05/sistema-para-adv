import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TIPOS_AUDIENCIA } from "@/server/audiencias";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select, Textarea } from "@/components/ui/input";
import { novaAudienciaAction } from "../actions";

export const metadata = { title: "Nova audiência" };
export const dynamic = "force-dynamic";

export default async function PaginaNovaAudiencia({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const sessao = await exigirSessao();
  const { erro } = await searchParams;
  if (!["socio", "advogado"].includes(sessao.papel)) return <Alert tom="perigo">Apenas advogado ou sócio agenda audiência.</Alert>;
  const supabase = await criarClienteServidor();
  const [{ data: processos }, { data: membros }] = await Promise.all([
    supabase.from("processos").select("id, numero_cnj_mascara").order("atualizado_em", { ascending: false }).limit(300),
    supabase.from("escritorio_membros").select("usuario_id, nome_completo").not("usuario_id", "is", null).eq("ativo", true).order("nome_completo"),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/audiencias" className="text-sm text-zinc-500 hover:underline">
          ← Audiências
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Nova audiência</h1>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Dados da audiência</CardTitle>
          <CardDescription>O horário é o do escritório (Cuiabá, por padrão). O alerta sai no dia útil anterior, às 08h.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={novaAudienciaAction} className="grid gap-3 sm:grid-cols-2">
            <Campo label="Processo">
              <Select name="processo_id" required defaultValue="">
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
              <Select name="tipo" defaultValue="instrucao">
                {TIPOS_AUDIENCIA.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Data e hora">
              <Input name="data_hora" type="datetime-local" required />
            </Campo>
            <Campo label="Modalidade">
              <Select name="modalidade" defaultValue="presencial">
                <option value="presencial">presencial</option>
                <option value="virtual">virtual</option>
              </Select>
            </Campo>
            <Campo label="Local ou link">
              <Input name="local_ou_link" placeholder="Fórum, sala ou link da videoconferência" />
            </Campo>
            <Campo label="Responsável">
              <Select name="responsavel_id" defaultValue="">
                <option value="">Sem responsável definido</option>
                {(membros ?? []).map((m) => (
                  <option key={m.usuario_id as string} value={m.usuario_id as string}>
                    {m.nome_completo as string}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Observações" className="sm:col-span-2">
              <Textarea name="observacoes" rows={3} />
            </Campo>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit">Agendar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
