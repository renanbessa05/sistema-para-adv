import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMensagens, obterConversa } from "@/server/assistente";
import { LIMITE_TURNOS } from "@/lib/ia/historico";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Chat } from "./chat";
import { continuarEmNovaAction, encerrarConversaAction, renomearConversaAction } from "../actions";

export const metadata = { title: "Assistente" };
export const dynamic = "force-dynamic";

export default async function PaginaConversa({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const sessao = await exigirSessao();
  const { id } = await params;
  const { erro } = await searchParams;
  const supabase = await criarClienteServidor();
  const conversa = await obterConversa(supabase, id);
  if (!conversa) notFound();
  const mensagens = await listarMensagens(supabase, id);
  const propria = conversa.usuario_id === sessao.usuarioId;
  const { data: processo } = conversa.processo_id ? await supabase.from("processos").select("id, numero_cnj_mascara").eq("id", conversa.processo_id).maybeSingle() : { data: null };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/assistente" className="text-sm text-zinc-500 hover:underline">
            ← Conversas
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {conversa.titulo ?? "Conversa"}
            {conversa.encerrada_em ? <Badge tom="neutro">encerrada</Badge> : null}
            {!propria ? <Badge tom="alerta">conversa de outra pessoa (só leitura)</Badge> : null}
          </h1>
          {processo ? (
            <p className="text-sm text-zinc-500">
              Processo em foco:{" "}
              <Link href={`/processos/${processo.id}`} className="font-mono hover:underline">
                {processo.numero_cnj_mascara as string}
              </Link>
            </p>
          ) : null}
        </div>
        {propria ? (
          <div className="flex flex-wrap gap-2">
            <form action={renomearConversaAction.bind(null, id)} className="flex gap-1">
              <Input name="titulo" defaultValue={conversa.titulo ?? ""} placeholder="Renomear" className="w-44" maxLength={120} />
              <Button type="submit" variante="contorno" tamanho="sm">
                Salvar
              </Button>
            </form>
            <form action={continuarEmNovaAction.bind(null, id)}>
              <Button type="submit" variante="secundaria" tamanho="sm">
                Continuar em nova conversa
              </Button>
            </form>
            {!conversa.encerrada_em ? (
              <form action={encerrarConversaAction.bind(null, id)}>
                <Button type="submit" variante="fantasma" tamanho="sm">
                  Encerrar
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {conversa.turnos >= LIMITE_TURNOS ? <Alert tom="alerta">Conversa longa: para manter a qualidade e o custo, continue em uma nova conversa (ela recebe um resumo desta).</Alert> : null}
      <Chat conversaId={id} inicial={mensagens.map((m) => ({ id: m.id, papel: m.direcao === "entrada" ? ("pessoa" as const) : ("assistente" as const), tipo: m.tipo, texto: m.texto ?? "" }))} somenteLeitura={!propria || Boolean(conversa.encerrada_em)} />
    </div>
  );
}
