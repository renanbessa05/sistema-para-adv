import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarDocumento } from "@/server/processos";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Campo, GrupoCampos, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { NavegacaoConfiguracoes } from "../navegacao";
import { salvarEscritorio } from "./actions";

export const metadata = { title: "Escritório" };
export const dynamic = "force-dynamic";

export default async function PaginaEscritorio({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") redirect("/configuracoes");
  const { erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const { data: e } = await supabase.from("escritorios").select("nome, razao_social, cnpj, timezone, dias_seguranca_padrao, horario_resumo, semana_inclui_proxima_segunda").eq("id", sessao.escritorioId).maybeSingle();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Configurações</h1>
          <p className="text-sm text-zinc-500">Dados do escritório, fuso horário e padrões que valem para toda a equipe.</p>
        </div>
      </div>
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes/escritorio" />
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      <form action={salvarEscritorio} className="flex max-w-3xl flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Escritório</CardTitle>
            <CardDescription>Dados do tenant. O fuso define “hoje” para prazos, resumo e alertas.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <GrupoCampos titulo="Identificação" colunas={2}>
              <Campo label="Nome">
                <Input name="nome" required defaultValue={(e?.nome as string) ?? ""} />
              </Campo>
              <Campo label="Razão social">
                <Input name="razao_social" defaultValue={(e?.razao_social as string | null) ?? ""} />
              </Campo>
              <Campo label="CNPJ">
                <Input name="cnpj" defaultValue={formatarDocumento(e?.cnpj as string | null)} inputMode="numeric" />
              </Campo>
              <Campo label="Fuso horário (IANA)" dica="Ex.: America/Cuiaba. Define o “hoje” dos prazos e alertas.">
                <Input name="timezone" defaultValue={(e?.timezone as string) ?? "America/Cuiaba"} />
              </Campo>
            </GrupoCampos>
            <GrupoCampos titulo="Rotina do dia" colunas={2}>
              <Campo label="Horário do resumo do dia (local)">
                <Input name="horario_resumo" type="time" defaultValue={String(e?.horario_resumo ?? "07:30").slice(0, 5)} />
              </Campo>
              <Campo label="Dias úteis de segurança (padrão)" dica="Antecedência da data interna em relação à data fatal, quando o ato não define outra.">
                <Input name="dias_seguranca_padrao" type="number" min={0} max={30} defaultValue={String(e?.dias_seguranca_padrao ?? 2)} />
              </Campo>
              <label className="flex items-center gap-2.5 text-sm text-zinc-800 sm:col-span-2">
                <input type="checkbox" name="semana_inclui_proxima_segunda" defaultChecked={e?.semana_inclui_proxima_segunda !== false} className="h-4 w-4 rounded border-zinc-300 accent-marca-600" /> “Semana” inclui a próxima segunda-feira
              </label>
            </GrupoCampos>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit">Salvar</Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
