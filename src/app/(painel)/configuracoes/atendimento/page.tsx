import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { APROVACAO_META } from "@/lib/whatsapp";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Campo, GrupoCampos, Input } from "@/components/ui/input";
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Configurações</h1>
          <p className="text-sm text-zinc-500">Atendimento ao cliente por WhatsApp: quando o sistema pode responder e em que horário.</p>
        </div>
      </div>
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
          <form action={salvarRegrasAtendimento} className="flex flex-col gap-5">
            <label className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3 text-sm font-medium text-zinc-800">
              <input type="checkbox" name="envio_ativo" defaultChecked={envio} className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 accent-marca-600" />
              <span className="min-w-0">Permitir envio ao cliente (respostas automáticas e respostas aprovadas)</span>
            </label>

            <GrupoCampos titulo="Horário de atendimento" descricao="Fora desse horário as respostas ficam em espera." colunas={2}>
              <Campo label="Início do atendimento">
                <Input type="time" name="horario_inicio" defaultValue={inicio} />
              </Campo>
              <Campo label="Fim do atendimento">
                <Input type="time" name="horario_fim" defaultValue={fim} />
              </Campo>
            </GrupoCampos>

            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="mb-1 text-sm font-bold text-zinc-950">Dias de atendimento</legend>
              <div className="flex flex-wrap gap-2">
                {Object.entries(ROTULO_DIA).map(([n, rotulo]) => (
                  <label key={n} className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[13px] font-semibold text-zinc-600 shadow-xs transition-colors hover:border-zinc-300 hover:text-zinc-900 has-[:checked]:border-marca-600 has-[:checked]:bg-marca-600 has-[:checked]:text-white">
                    <input type="checkbox" name="dias" value={n} defaultChecked={dias.includes(Number(n))} className="h-3.5 w-3.5 accent-white" />
                    {rotulo}
                  </label>
                ))}
              </div>
            </fieldset>

            <p className="text-xs text-zinc-500">
              Textos fixos e templates da Meta {APROVACAO_META}. Antes da aprovação do template, a mensagem fora da janela de 24 h não sai.
            </p>
            <div className="flex justify-end">
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
