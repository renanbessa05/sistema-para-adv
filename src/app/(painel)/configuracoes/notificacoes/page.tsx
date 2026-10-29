import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { REGRAS } from "@/lib/notificacoes/regras";
import type { Canal, EventoNotificacao } from "@/lib/notificacoes/tipos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { NavegacaoConfiguracoes } from "../navegacao";
import { alternarCanal, restaurarPadrao } from "./actions";

export const metadata = { title: "Notificações" };
export const dynamic = "force-dynamic";

const ROTULO_EVENTO: Record<string, string> = {
  nova_publicacao: "Nova publicação",
  publicacao_sem_processo: "Publicação sem processo na carteira",
  publicacao_sem_tratamento_24h: "Publicação sem tratamento há 24 h úteis",
  publicacao_sem_tratamento_48h: "Publicação sem tratamento há 48 h úteis (sócios)",
  prazo_d3: "Prazo em 3 dias",
  prazo_d1: "Prazo amanhã",
  prazo_d0: "Prazo hoje",
  prazo_vencido: "Prazo vencido",
  tarefa_atrasada: "Tarefa atrasada",
  tarefa_reatribuida: "Tarefa reatribuída",
  resumo_do_dia: "Resumo do dia",
  captacao_falhou: "Captação do DJEN falhou",
  calendario_incompleto: "Calendário forense incompleto",
  convite: "Convite para a equipe",
};
const ROTULO_DESTINATARIOS: Record<string, string> = { responsavel: "responsável", responsavel_e_socios: "responsável e sócios", socios: "sócios", socios_e_administrativo: "sócios e administrativo", todos_ativos: "todos os ativos", usuario_alvo: "pessoa envolvida" };
const CANAIS: Canal[] = ["painel", "whatsapp", "email"];
const ROTULO_CANAL: Record<Canal, string> = { painel: "Painel", whatsapp: "WhatsApp", email: "E-mail" };

export default async function PaginaNotificacoes({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") redirect("/configuracoes");
  const { erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const { data: overrides } = await supabase.from("regras_notificacao").select("evento, canal, ativo").eq("escritorio_id", sessao.escritorioId);
  const override = new Map<string, boolean>((overrides ?? []).map((r) => [`${r.evento}:${r.canal}`, Boolean(r.ativo)]));
  const eventos = Object.keys(REGRAS) as EventoNotificacao[];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Configurações</h1>
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes/notificacoes" />
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Canais por evento</CardTitle>
          <CardDescription>A regra padrão vem do sistema (docs/regras/notificacoes.md). Aqui o escritório liga ou desliga cada canal; WhatsApp exige telefone verificado e e-mail, convite aceito. Painel e eventos críticos continuam registrados no painel.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Evento</TH>
                <TH>Quem recebe</TH>
                <TH>Quando</TH>
                {CANAIS.map((c) => (
                  <TH key={c}>{ROTULO_CANAL[c]}</TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {eventos.map((evento) => {
                const regra = REGRAS[evento];
                return (
                  <TR key={evento}>
                    <TD>{ROTULO_EVENTO[evento] ?? evento}</TD>
                    <TD className="text-xs">{ROTULO_DESTINATARIOS[regra.destinatarios] ?? regra.destinatarios}</TD>
                    <TD className="text-xs">
                      {regra.horarioLocal === "imediato" || !regra.horarioLocal ? "imediato" : `às ${regra.horarioLocal}`}
                      {regra.somenteDiasUteis ? ", dias úteis" : ""}
                    </TD>
                    {CANAIS.map((canal) => {
                      const padrao = regra.canais.includes(canal);
                      const chave = `${evento}:${canal}`;
                      const temOverride = override.has(chave);
                      const ativo = temOverride ? override.get(chave)! : padrao;
                      return (
                        <TD key={canal}>
                          <div className="flex flex-col items-start gap-1">
                            <form action={alternarCanal}>
                              <input type="hidden" name="evento" value={evento} />
                              <input type="hidden" name="canal" value={canal} />
                              <input type="hidden" name="ativo" value={ativo ? "0" : "1"} />
                              <Button type="submit" variante={ativo ? "primaria" : "contorno"} tamanho="sm" className="min-w-20 text-xs" aria-label={`${ativo ? "Desativar" : "Ativar"} ${ROTULO_CANAL[canal]} para ${ROTULO_EVENTO[evento] ?? evento}`}>
                                {ativo ? "ativo" : "desligado"}
                              </Button>
                            </form>
                            {temOverride ? (
                              <form action={restaurarPadrao} className="flex items-center gap-1">
                                <input type="hidden" name="evento" value={evento} />
                                <input type="hidden" name="canal" value={canal} />
                                <Badge tom="alerta">alterado</Badge>
                                <button type="submit" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
                                  padrão: {padrao ? "ativo" : "desligado"}
                                </button>
                              </form>
                            ) : null}
                          </div>
                        </TD>
                      );
                    })}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
