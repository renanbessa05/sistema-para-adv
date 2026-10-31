import Link from "next/link";
import { AlertTriangle, Bell, CalendarClock, CheckCheck, ClipboardCheck, Mail, Newspaper, type LucideIcon } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Vazio } from "@/components/ui/alert";
import { Button, classesBotao } from "@/components/ui/button";
import { cn, formatarDataHora } from "@/lib/utils";
import { marcarLida, marcarTodasLidas } from "./actions";

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

/** Ícone e cor por família de evento: vermelho para o que já estourou, âmbar para o que está perto. */
const ESTILO_EVENTO: Record<string, { Icone: LucideIcon; cor: string }> = {
  nova_publicacao: { Icone: Newspaper, cor: "bg-marca-50 text-marca-600" },
  publicacao_sem_processo: { Icone: Newspaper, cor: "bg-ouro-100 text-ouro-600" },
  publicacao_sem_tratamento_24h: { Icone: Newspaper, cor: "bg-ouro-100 text-ouro-600" },
  publicacao_sem_tratamento_48h: { Icone: Newspaper, cor: "bg-red-50 text-red-600" },
  prazo_d3: { Icone: CalendarClock, cor: "bg-marca-50 text-marca-600" },
  prazo_d1: { Icone: CalendarClock, cor: "bg-ouro-100 text-ouro-600" },
  prazo_d0: { Icone: CalendarClock, cor: "bg-red-50 text-red-600" },
  prazo_vencido: { Icone: AlertTriangle, cor: "bg-red-50 text-red-600" },
  tarefa_atrasada: { Icone: ClipboardCheck, cor: "bg-red-50 text-red-600" },
  tarefa_reatribuida: { Icone: ClipboardCheck, cor: "bg-marca-50 text-marca-600" },
  resumo_do_dia: { Icone: Mail, cor: "bg-zinc-100 text-zinc-500" },
  captacao_falhou: { Icone: AlertTriangle, cor: "bg-red-50 text-red-600" },
  calendario_incompleto: { Icone: AlertTriangle, cor: "bg-ouro-100 text-ouro-600" },
  convite: { Icone: Mail, cor: "bg-marca-50 text-marca-600" },
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2.5 text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">
            Notificações
            {naoLidas ? <Badge tom="info">{naoLidas} não lidas</Badge> : null}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">Avisos do painel. WhatsApp e e-mail seguem as mesmas regras (Configurações → Notificações).</p>
        </div>
        {naoLidas ? (
          <form action={marcarTodasLidas}>
            <Button variante="contorno" tamanho="sm" type="submit">
              <CheckCheck aria-hidden />
              Marcar todas como lidas
            </Button>
          </form>
        ) : null}
      </div>
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-zinc-100">
          <CardTitle>Últimas 100</CardTitle>
          <CardDescription>Não lidas em destaque; as lidas ficam esmaecidas.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {itens.length === 0 ? (
            <div className="p-4">
              <Vazio titulo="Nenhuma notificação ainda" descricao="Prazos próximos, publicações sem tratamento e tarefas atrasadas aparecem aqui." />
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {itens.map((n) => {
                const vars = (n.variaveis ?? {}) as Record<string, string>;
                const link = linkDoObjeto(n.objeto_tipo, n.objeto_id);
                const lida = Boolean(n.lida_em);
                const estilo = ESTILO_EVENTO[n.evento] ?? { Icone: Bell, cor: "bg-zinc-100 text-zinc-500" };
                const Icone = estilo.Icone;
                const texto = vars.texto ?? vars.assunto ?? "";
                return (
                  <li key={n.id} className={cn("grid grid-cols-[36px_minmax(0,1fr)] items-start gap-x-3.5 gap-y-2 px-4 py-3.5 sm:grid-cols-[36px_minmax(0,1fr)_auto] sm:px-5", lida ? "bg-white" : "bg-marca-50/30")}>
                    <span className={cn("grid h-9 w-9 place-items-center rounded-lg", lida ? "bg-zinc-100 text-zinc-400" : estilo.cor)} aria-hidden>
                      <Icone className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <p className={cn("flex flex-wrap items-center gap-2 text-sm", lida ? "font-medium text-zinc-600" : "font-bold text-zinc-950")}>
                        {ROTULOS[n.evento] ?? n.evento}
                        {!lida ? <span className="h-2 w-2 rounded-full bg-marca-500" aria-hidden /> : null}
                      </p>
                      {texto ? <p className={cn("mt-0.5 line-clamp-2 text-[13px] leading-snug", lida ? "text-zinc-500" : "text-zinc-700")}>{texto}</p> : null}
                      <p className="mt-1 text-xs text-zinc-400 tabular-nums">{formatarDataHora(n.enviada_em ?? n.agendada_para)}</p>
                    </div>
                    <div className="col-start-2 flex flex-wrap items-center gap-1.5 sm:col-start-3 sm:self-center">
                      {link ? (
                        <Link href={link} className={classesBotao({ variante: lida ? "fantasma" : "contorno", tamanho: "sm" })}>
                          abrir
                        </Link>
                      ) : null}
                      {!lida ? (
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
