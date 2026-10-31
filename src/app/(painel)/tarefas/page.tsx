import Link from "next/link";
import { Plus } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMembros, mapaNomes, membrosComUsuario } from "@/server/equipe";
import { listarTarefasQuadro } from "@/server/tarefas";
import { hojeNoFuso } from "@/lib/prazos";
import { QuadroTarefas } from "@/components/dominio/QuadroTarefas";
import { Select } from "@/components/ui/input";
import { Button, classesBotao } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tarefas" };
export const dynamic = "force-dynamic";

export default async function PaginaTarefas({ searchParams }: { searchParams: Promise<{ executor?: string; processo?: string; erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  const filtros = await searchParams;
  const supabase = await criarClienteServidor();
  const socio = sessao.papel === "socio";

  // Padrão: minhas tarefas. Sócio pode escolher "todos" ou outro membro.
  const executorId = filtros.executor === "todos" ? (socio ? null : sessao.usuarioId) : filtros.executor && socio ? filtros.executor : sessao.usuarioId;
  const processoId = filtros.processo && /^[0-9a-f-]{36}$/i.test(filtros.processo) ? filtros.processo : null;

  const [{ data: escritorio }, membros] = await Promise.all([supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).maybeSingle(), listarMembros(supabase, sessao.escritorioId)]);
  const hoje = hojeNoFuso((escritorio?.timezone as string | undefined) ?? "America/Cuiaba");
  const tarefas = await listarTarefasQuadro(supabase, { executorId, processoId, hoje });
  const nomes = mapaNomes(membros);

  // Processos para o filtro: os que aparecem nas tarefas carregadas mais o filtrado
  const processosNoQuadro = new Map<string, string>();
  for (const t of tarefas) if (t.processo_id && t.processos?.numero_cnj_mascara) processosNoQuadro.set(t.processo_id, t.processos.numero_cnj_mascara);
  if (processoId && !processosNoQuadro.has(processoId)) {
    const { data: p } = await supabase.from("processos").select("id, numero_cnj_mascara").eq("id", processoId).maybeSingle();
    if (p) processosNoQuadro.set(p.id as string, (p.numero_cnj_mascara as string) ?? p.id);
  }
  const atrasadas = tarefas.filter((t) => t.atrasada).length;
  const criticas = tarefas.filter((t) => t.critica).length;
  const abertas = tarefas.filter((t) => !["concluida", "cancelada"].includes(t.status)).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Tarefas</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
            <span>{executorId === sessao.usuarioId ? "Suas tarefas" : executorId ? `Tarefas de ${nomes.get(executorId) ?? "membro"}` : "Todas as tarefas do escritório"}</span>
            <Contador valor={abertas} rotulo={abertas === 1 ? "aberta" : "abertas"} />
            <Contador valor={atrasadas} rotulo={atrasadas === 1 ? "atrasada" : "atrasadas"} tom={atrasadas ? "alerta" : "ok"} />
            <Contador valor={criticas} rotulo={criticas === 1 ? "crítica" : "críticas"} tom={criticas ? "perigo" : "ok"} />
          </p>
        </div>
        <Link href={`/tarefas/nova${processoId ? `?processo=${processoId}` : ""}`} className={classesBotao()}>
          <Plus aria-hidden />
          Nova tarefa
        </Link>
      </div>
      {filtros.erro ? <Alert tom="perigo">{filtros.erro}</Alert> : null}
      {filtros.ok ? <Alert tom="sucesso">{filtros.ok}</Alert> : null}

      <form method="get" className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
        <Select name="executor" defaultValue={executorId ?? "todos"} className="h-9 w-full shadow-none sm:w-auto sm:min-w-52" aria-label="Executor">
          <option value={sessao.usuarioId}>Eu ({sessao.nome})</option>
          {socio ? <option value="todos">Todos do escritório</option> : null}
          {socio
            ? membrosComUsuario(membros)
                .filter((m) => m.usuario_id !== sessao.usuarioId)
                .map((m) => (
                  <option key={m.usuario_id} value={m.usuario_id}>
                    {m.nome_completo}
                  </option>
                ))
            : null}
        </Select>
        <Select name="processo" defaultValue={processoId ?? ""} className="h-9 w-full font-mono text-xs shadow-none sm:w-auto sm:min-w-60" aria-label="Processo">
          <option value="">Todos os processos</option>
          {[...processosNoQuadro.entries()].map(([id, numero]) => (
            <option key={id} value={id}>
              {numero}
            </option>
          ))}
        </Select>
        <Button type="submit" variante="secundaria" className="w-full sm:w-auto">
          Filtrar
        </Button>
      </form>

      <QuadroTarefas tarefas={tarefas} nomes={nomes} mostrarExecutor={executorId === null} />
    </div>
  );
}

const TOM_CONTADOR = {
  neutro: "text-zinc-700",
  ok: "text-zinc-400",
  alerta: "text-ouro-700",
  perigo: "text-red-600",
} as const;

function Contador({ valor, rotulo, tom = "neutro" }: { valor: number; rotulo: string; tom?: keyof typeof TOM_CONTADOR }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[13px]", TOM_CONTADOR[tom])}>
      <span className="h-1 w-1 rounded-full bg-current opacity-50" aria-hidden />
      <span className="font-bold tabular-nums">{valor}</span> {rotulo}
    </span>
  );
}
