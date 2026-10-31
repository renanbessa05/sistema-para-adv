import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatarDataHora } from "@/lib/utils";
import { marcarLida, marcarTodasLidas } from "./actions";
import Link from "next/link";

export const metadata = { title: "Notificações" };

const ROTULOS: Record<string, string> = {
  nova_publicacao: "Nova publicação",
  publicacao_sem_processo: "Publicação sem processo",
  publicacao_sem_tratamento_24h: "Publicação sem tratamento (24 h)",
  publicacao_sem_tratamento_48h: "Publicação sem tratamento (48 h)",
  prazo_d3: "Prazo em 3 dias",
  prazo_d1: "Prazo amanhã",
  prazo_d0: "Prazo hoje",
  prazo_vencido: "Prazo vencido",
  tarefa_atrasada: "Tarefa atrasada",
  tarefa_reatribuida: "Tarefa reatribuída",
  resumo_do_dia: "Resumo do dia",
  captacao_falhou: "Captação falhou",
  calendario_incompleto: "Calendário incompleto",
  convite: "Convite",
};

function linkDoObjeto(tipo: string | null, id: string | null): string | null {
  if (!tipo || !id) return null;
  if (tipo === "prazo") return `/prazos/${id}`;
  if (tipo === "publicacao") return `/publicacoes/${id}`;
  if (tipo === "tarefa") return `/tarefas/${id}`;
  if (tipo === "captacao") return "/admin/status";
  return null;
}

export default async function PaginaNotificacoes() {
  const sessao = await exigirSessao();
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("notificacoes")
    .select("id, evento, variaveis, objeto_tipo, objeto_id, agendada_para, enviada_em, lida_em, status")
    .eq("destinatario_id", sessao.usuarioId)
    .eq("canal", "painel")
    .in("status", ["enviada", "entregue", "lida"])
    .order("agendada_para", { ascending: false })
    .limit(100);
  const itens = data ?? [];
  const naoLidas = itens.filter((n) => !n.lida_em).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Notificações {naoLidas ? <Badge tom="info">{naoLidas} não lidas</Badge> : null}</h1>
        {naoLidas ? (
          <form action={marcarTodasLidas}>
            <Button variante="contorno" tamanho="sm" type="submit">
              Marcar todas como lidas
            </Button>
          </form>
        ) : null}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Últimas 100</CardTitle>
          <CardDescription>Avisos do painel. WhatsApp e e-mail seguem as mesmas regras (Configurações → Notificações).</CardDescription>
        </CardHeader>
        <CardContent>
          {itens.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma notificação ainda.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {itens.map((n) => {
                const vars = (n.variaveis ?? {}) as Record<string, string>;
                const link = linkDoObjeto(n.objeto_tipo, n.objeto_id);
                return (
                  <li key={n.id} className={`flex items-start justify-between gap-3 py-2 text-sm ${n.lida_em ? "text-zinc-500" : ""}`}>
                    <div className="min-w-0">
                      <p className="font-medium">{ROTULOS[n.evento] ?? n.evento}</p>
                      <p className="truncate">{vars.texto ?? vars.assunto ?? ""}</p>
                      <p className="text-xs text-zinc-400">{formatarDataHora(n.enviada_em ?? n.agendada_para)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {link ? (
                        <Link href={link} className="text-xs underline">
                          abrir
                        </Link>
                      ) : null}
                      {!n.lida_em ? (
                        <form action={marcarLida}>
                          <input type="hidden" name="id" value={n.id} />
                          <Button variante="fantasma" tamanho="sm" type="submit">
                            lida
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
