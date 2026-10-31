import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { advogadosESocios, listarMembros, mapaNomes } from "@/server/equipe";
import { mapaComarcas, podeEditarProcesso, podeImportarCarteira, proximosPrazosPorProcesso, STATUS_PROCESSO } from "@/server/processos";
import { hojeNoFuso } from "@/lib/prazos";
import { ListaProcessos, type LinhaProcesso } from "@/components/dominio/ListaProcessos";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

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
  const linkPagina = (n: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filtros)) if (v && !["pagina", "erro", "ok"].includes(k)) q.set(k, v);
    q.set("pagina", String(n));
    return `/processos?${q.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Processos</h1>
          <p className="text-sm text-zinc-500">{total} processo(s) na carteira com os filtros atuais.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/processos/kanban" className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Kanban
          </Link>
          {podeImportarCarteira(sessao.papel) ? (
            <Link href="/processos/importar" className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
              Importar CSV
            </Link>
          ) : null}
          {podeEditarProcesso(sessao.papel) ? (
            <Link href="/processos/novo" className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900">
              Novo processo
            </Link>
          ) : null}
        </div>
      </div>

      {filtros.erro ? <Alert tom="perigo">{filtros.erro}</Alert> : null}
      {filtros.ok ? <Alert tom="sucesso">{filtros.ok}</Alert> : null}
      {error ? <Alert tom="perigo">Não foi possível carregar os processos: {error.message}</Alert> : null}

      <form method="get" className="grid gap-2 rounded-lg border border-zinc-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5 dark:border-zinc-800 dark:bg-zinc-950">
        <Input name="busca" defaultValue={busca} placeholder="Número CNJ ou nome de parte" className="lg:col-span-2" aria-label="Busca" />
        <Select name="status" defaultValue={filtros.status ?? ""} aria-label="Status">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_PROCESSO).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </Select>
        <Select name="responsavel" defaultValue={filtros.responsavel ?? ""} aria-label="Responsável">
          <option value="">Qualquer responsável</option>
          <option value="sem">Sem responsável</option>
          {advogadosESocios(membros).map((m) => (
            <option key={m.usuario_id} value={m.usuario_id}>
              {m.nome_completo}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Select name="sigilo" defaultValue={filtros.sigilo ?? ""} aria-label="Sigilo">
            <option value="">Sigilo: todos</option>
            <option value="sim">Só sigilosos</option>
            <option value="nao">Só comuns</option>
          </Select>
          <Button type="submit" variante="secundaria">
            Filtrar
          </Button>
        </div>
      </form>

      <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <ListaProcessos linhas={linhas} hoje={hoje} timeZone={timeZone} />
      </div>

      {totalPaginas > 1 ? (
        <nav className="flex items-center justify-between text-sm" aria-label="Paginação">
          {pagina > 1 ? (
            <Link href={linkPagina(pagina - 1)} className="hover:underline">
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-zinc-500">
            Página {pagina} de {totalPaginas}
          </span>
          {pagina < totalPaginas ? (
            <Link href={linkPagina(pagina + 1)} className="hover:underline">
              Próxima →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
