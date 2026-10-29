import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { APROVACAO_META } from "@/lib/whatsapp";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { NavegacaoConfiguracoes } from "../navegacao";
import { salvarRegrasAtendimento } from "./actions";

export const metadata = { title: "Atendimento ao cliente" };
export const dynamic = "force-dynamic";

const ROTULO_DIA: Record<number, string> = { 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb", 7: "Dom" };

export default async function PaginaAtendimento({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") redirect("/configuracoes");
  const { erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const { data: regra } = await supabase.from("regras_atendimento").select("envio_ativo, horario_inicio, horario_fim, dias_semana").eq("escritorio_id", sessao.escritorioId).maybeSingle();
  const envio = regra?.envio_ativo === true;
  const inicio = String(regra?.horario_inicio ?? "").slice(0, 5);
  const fim = String(regra?.horario_fim ?? "").slice(0, 5);
  const dias = (regra?.dias_semana as number[] | null) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Configurações</h1>
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes/atendimento" />
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Atendimento ao cliente por WhatsApp</CardTitle>
          <CardDescription>
            Desligado por padrão. Enquanto estiver desligado, nada é enviado a cliente: as respostas ficam registradas em Atendimento como não enviadas. Para ligar, informe o horário de atendimento e os dias. Não há horário sugerido pelo sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={salvarRegrasAtendimento} className="flex flex-col gap-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="envio_ativo" defaultChecked={envio} className="h-4 w-4" />
              Permitir envio ao cliente (respostas automáticas e respostas aprovadas)
            </label>
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-col gap-1 text-sm">
                Início do atendimento
                <input type="time" name="horario_inicio" defaultValue={inicio} className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Fim do atendimento
                <input type="time" name="horario_fim" defaultValue={fim} className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900" />
              </label>
            </div>
            <fieldset className="flex flex-wrap gap-3 text-sm">
              <legend className="mb-1 font-medium">Dias de atendimento</legend>
              {Object.entries(ROTULO_DIA).map(([n, rotulo]) => (
                <label key={n} className="flex items-center gap-1">
                  <input type="checkbox" name="dias" value={n} defaultChecked={dias.includes(Number(n))} />
                  {rotulo}
                </label>
              ))}
            </fieldset>
            <p className="text-xs text-zinc-500">
              Textos fixos e templates da Meta {APROVACAO_META}. Antes da aprovação do template, a mensagem fora da janela de 24 h não sai.
            </p>
            <div>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
