import Link from "next/link";
import { ChevronLeft, ChevronRight, Kanban, Plus, Search, Upload } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { advogadosESocios, listarMembros, mapaNomes } from "@/server/equipe";
import { mapaComarcas, podeEditarProcesso, podeImportarCarteira, proximosPrazosPorProcesso, STATUS_PROCESSO } from "@/server/processos";
import { hojeNoFuso } from "@/lib/prazos";
import { ListaProcessos, type LinhaProcesso } from "@/components/dominio/ListaProcessos";
import { Button, classesBotao } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export const metadata = { title: "Processos" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 50;

type Busca = { status?: string; responsavel?: string; sigilo?: string; busca?: string; pagina?: string; erro?: string; ok?: string };

export default async function PaginaProcessos({ searchParams }: { searchParams: Promise<Busca> }) {
  const sessao = await exigirSessao();
  const filtros = await searchParams;
  const supabase = await criarClienteServidor();
  const pagina = Math.max(1, Number(filtros.pagina) || 1);
  const inicio = (pagina - 1) * POR_PAGINA;

  const [{ data: escritorio }, membros] = await Promise.all([
    supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).maybeSingle(),
    listarMembros(supabase, sessao.escritorioId, { somenteAtivos: false }),
  ]);
  const timeZone = (escritorio?.timezone as string | undefined) ?? "America/Cuiaba";
  const hoje = hojeNoFuso(timeZone);
  const nomes = mapaNomes(membros);

  // Busca por nome de parte: resolve os ids antes (processo_partes), depois filtra os processos
  let idsPorParte: string[] | null = null;
  const busca = (filtros.busca ?? "").trim();
  const digitos = busca.replace(/\D/g, "");
  const buscaPorNumero = busca !== "" && digitos.length >= 4 && digitos.length / busca.replace(/\s/g, "").length > 0.6;
  if (busca && !buscaPorNumero) {
    const { data: partes } = await supabase.from("processo_partes").select("processo_id").ilike("nome", `%${busca}%`).limit(1000);
    idsPorParte = [...new Set((partes ?? []).map((p) => p.processo_id as string))];
  }

  let consulta = supabase
    .from("processos")
    .select("id, numero_cnj, numero_cnj_mascara, status, segredo_justica, responsavel_id, comarca_id, atualizado_em, processo_partes(nome, eh_cliente), movimentacoes(nome, data)", { count: "exact" })
    .eq("escritorio_id", sessao.escritorioId)
    .order("atualizado_em", { ascending: false })
    .order("data", { referencedTable: "movimentacoes", ascending: false })
    .limit(1, { referencedTable: "movimentacoes" })
    .range(inicio, inicio + POR_PAGINA - 1);
  if (filtros.status && filtros.status in STATUS_PROCESSO) consulta = consulta.eq("status", filtros.status);
  if (filtros.responsavel === "sem") consulta = consulta.is("responsavel_id", null);
  else if (filtros.responsavel) consulta = consulta.eq("responsavel_id", filtros.responsavel);
  if (filtros.sigilo === "sim") consulta = consulta.eq("segredo_justica", true);
  if (filtros.sigilo === "nao") consulta = consulta.eq("segredo_justica", false);
  if (buscaPorNumero) consulta = consulta.ilike("numero_cnj", `%${digitos}%`);
  if (idsPorParte) consulta = consulta.in("id", idsPorParte.length ? idsPorParte : ["00000000-0000-0000-0000-000000000000"]);

  const { data: processos, count, error } = await consulta;

  type Linha = { id: string; numero_cnj_mascara: string | null; status: string; segredo_justica: boolean; responsavel_id: string | null; comarca_id: string | null; processo_partes: { nome: string; eh_cliente: boolean }[] | null; movimentacoes: { nome: string; data: string }[] | null };
  const lista = (processos ?? []) as unknown as Linha[];
  const [comarcas, prazos] = await Promise.all([mapaComarcas(supabase, lista.map((p) => p.comarca_id ?? "")), proximosPrazosPorProcesso(supabase, lista.map((p) => p.id))]);

  const linhas: LinhaProcesso[] = lista.map((p) => ({
    id: p.id,
    numero_cnj_mascara: p.numero_cnj_mascara,
    status: p.status,
    segredo_justica: p.segredo_justica,
    responsavel: p.responsavel_id ? (nomes.get(p.responsavel_id) ?? "membro") : null,
    cliente: (p.processo_partes ?? []).filter((x) => x.eh_cliente).map((x) => x.nome).join(", ") || null,
    comarca: p.comarca_id ? (comarcas.get(p.comarca_id) ?? null) : null,
    ultimaMovimentacao: p.movimentacoes?.[0] ?? null,
    proximoPrazo: prazos.get(p.id) ?? null,
  }));

  const total = count ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  /** Link que preserva os filtros atuais, trocando só o que for passado. */
  const linkCom = (mudancas: Partial<Busca>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filtros, ...mudancas })) if (v && !["erro", "ok"].includes(k)) q.set(k, v);
    const qs = q.toString();
    return qs ? `/processos?${qs}` : "/processos";
  };
  const linkPagina = (n: number) => linkCom({ pagina: String(n) });
  const statusAtual = filtros.status && filtros.status in STATUS_PROCESSO ? filtros.status : "";
  const pilulasStatus: { valor: string; rotulo: string }[] = [{ valor: "", rotulo: "Todos" }, ...Object.entries(STATUS_PROCESSO).map(([valor, rotulo]) => ({ valor, rotulo }))];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Processos</h1>
          <p className="text-sm text-zinc-500">
            <span className="font-semibold text-zinc-700 tabular-nums">{total}</span> processo(s) na carteira com os filtros atuais.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/processos/kanban" className={classesBotao({ variante: "contorno" })}>
            <Kanban aria-hidden />
            Kanban
          </Link>
          {podeImportarCarteira(sessao.papel) ? (
            <Link href="/processos/importar" className={classesBotao({ variante: "contorno" })}>
              <Upload aria-hidden />
              Importar CSV
            </Link>
          ) : null}
          {podeEditarProcesso(sessao.papel) ? (
            <Link href="/processos/novo" className={classesBotao({ variante: "primaria" })}>
              <Plus aria-hidden />
              Novo processo
            </Link>
          ) : null}
        </div>
      </div>

      {filtros.erro ? <Alert tom="perigo">{filtros.erro}</Alert> : null}
      {filtros.ok ? <Alert tom="sucesso">{filtros.ok}</Alert> : null}
      {error ? <Alert tom="perigo">Não foi possível carregar os processos: {error.message}</Alert> : null}

      <div className="flex flex-col gap-3">
        <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 whitespace-nowrap md:mx-0 md:px-0" aria-label="Filtrar por status">
          {pilulasStatus.map((p) => {
            const on = statusAtual === p.valor;
            return (
              <Link
                key={p.valor || "todos"}
                href={linkCom({ status: p.valor || undefined, pagina: undefined })}
                aria-current={on ? "page" : undefined}
                className={cn("inline-flex h-8 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-semibold transition-colors", on ? "border-marca-600 bg-marca-600 text-white shadow-marca" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900")}
              >
                {p.rotulo}
              </Link>
            );
          })}
        </nav>

        <form method="get" className="grid gap-2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-xs sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          {statusAtual ? <input type="hidden" name="status" value={statusAtual} /> : null}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
            <Input name="busca" defaultValue={busca} placeholder="Número CNJ ou nome de parte" className="pl-9" aria-label="Busca" />
          </div>
          <Select name="responsavel" defaultValue={filtros.responsavel ?? ""} aria-label="Responsável">
            <option value="">Qualquer responsável</option>
            <option value="sem">Sem responsável</option>
            {advogadosESocios(membros).map((m) => (
              <option key={m.usuario_id} value={m.usuario_id}>
                {m.nome_completo}
              </option>
            ))}
          </Select>
          <Select name="sigilo" defaultValue={filtros.sigilo ?? ""} aria-label="Sigilo">
            <option value="">Sigilo: todos</option>
            <option value="sim">Só sigilosos</option>
            <option value="nao">Só comuns</option>
          </Select>
          <Button type="submit" variante="secundaria" className="h-10 w-full lg:w-auto">
            Filtrar
          </Button>
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <ListaProcessos linhas={linhas} hoje={hoje} timeZone={timeZone} />
      </div>

      {totalPaginas > 1 ? (
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Paginação">
          {pagina > 1 ? (
            <Link href={linkPagina(pagina - 1)} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
              <ChevronLeft aria-hidden />
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-zinc-500 tabular-nums">
            Página {pagina} de {totalPaginas}
          </span>
          {pagina < totalPaginas ? (
            <Link href={linkPagina(pagina + 1)} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
              Próxima
              <ChevronRight aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
