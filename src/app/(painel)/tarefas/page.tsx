import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMembros, mapaNomes, membrosComUsuario } from "@/server/equipe";
import { listarTarefasQuadro } from "@/server/tarefas";
import { hojeNoFuso } from "@/lib/prazos";
import { QuadroTarefas } from "@/components/dominio/QuadroTarefas";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Tarefas</h1>
          <p className="text-sm text-zinc-500">
            {executorId === sessao.usuarioId ? "Suas tarefas" : executorId ? `Tarefas de ${nomes.get(executorId) ?? "membro"}` : "Todas as tarefas do escritório"} · {atrasadas} atrasada(s) · {criticas} crítica(s)
          </p>
        </div>
        <Link href={`/tarefas/nova${processoId ? `?processo=${processoId}` : ""}`} className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900">
          Nova tarefa
        </Link>
      </div>
      {filtros.erro ? <Alert tom="perigo">{filtros.erro}</Alert> : null}
      {filtros.ok ? <Alert tom="sucesso">{filtros.ok}</Alert> : null}

      <form method="get" className="flex flex-wrap items-center gap-2">
        <Select name="executor" defaultValue={executorId ?? "todos"} className="w-auto min-w-48" aria-label="Executor">
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
        <Select name="processo" defaultValue={processoId ?? ""} className="w-auto min-w-56" aria-label="Processo">
          <option value="">Todos os processos</option>
          {[...processosNoQuadro.entries()].map(([id, numero]) => (
            <option key={id} value={id}>
              {numero}
            </option>
          ))}
        </Select>
        <Button type="submit" variante="secundaria">
          Filtrar
        </Button>
      </form>

      <QuadroTarefas tarefas={tarefas} nomes={nomes} mostrarExecutor={executorId === null} />
    </div>
  );
}
