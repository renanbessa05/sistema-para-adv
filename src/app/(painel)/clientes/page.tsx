import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarDocumento, podeEditarProcesso } from "@/server/processos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, Vazio } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 50;

export default async function PaginaClientes({ searchParams }: { searchParams: Promise<{ busca?: string; pagina?: string; erro?: string; ok?: string; inativos?: string }> }) {
  const sessao = await exigirSessao();
  const { busca = "", pagina: paginaTexto, erro, ok, inativos } = await searchParams;
  const supabase = await criarClienteServidor();
  const pagina = Math.max(1, Number(paginaTexto) || 1);
  const inicio = (pagina - 1) * POR_PAGINA;

  let consulta = supabase
    .from("clientes")
    .select("id, tipo_pessoa, nome, cpf_cnpj, email, telefone_e164, ativo", { count: "exact" })
    .eq("escritorio_id", sessao.escritorioId)
    .order("nome")
    .range(inicio, inicio + POR_PAGINA - 1);
  if (inativos !== "1") consulta = consulta.eq("ativo", true);
  const termo = busca.trim();
  if (termo) {
    const digitos = termo.replace(/\D/g, "");
    consulta = digitos.length >= 3 && digitos.length === termo.replace(/[.\-/\s]/g, "").length ? consulta.ilike("cpf_cnpj", `%${digitos}%`) : consulta.or(`nome.ilike.%${termo.replace(/[%,()]/g, "")}%,email.ilike.%${termo.replace(/[%,()]/g, "")}%`);
  }
  const { data: clientes, count, error } = await consulta;

  // Quantidade de processos por cliente (partes marcadas como cliente)
  const ids = (clientes ?? []).map((c) => c.id as string);
  const contagem = new Map<string, number>();
  if (ids.length) {
    const { data: partes } = await supabase.from("processo_partes").select("cliente_id").in("cliente_id", ids).eq("eh_cliente", true);
    for (const p of partes ?? []) contagem.set(p.cliente_id as string, (contagem.get(p.cliente_id as string) ?? 0) + 1);
  }

  const total = count ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const link = (n: number) => `/clientes?busca=${encodeURIComponent(busca)}&pagina=${n}${inativos === "1" ? "&inativos=1" : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Clientes</h1>
          <p className="text-sm text-zinc-500">{total} cliente(s).</p>
        </div>
        {podeEditarProcesso(sessao.papel) ? (
          <Link href="/clientes/novo" className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900">
            Novo cliente
          </Link>
        ) : null}
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      {error ? <Alert tom="perigo">Não foi possível carregar: {error.message}</Alert> : null}

      <form method="get" className="flex flex-wrap items-center gap-2">
        <Input name="busca" defaultValue={busca} placeholder="Nome, e-mail ou CPF/CNPJ" className="max-w-md" aria-label="Busca" />
        <label className="inline-flex items-center gap-1 text-sm">
          <input type="checkbox" name="inativos" value="1" defaultChecked={inativos === "1"} /> incluir inativos
        </label>
        <Button type="submit" variante="secundaria">
          Buscar
        </Button>
      </form>

      <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {(clientes ?? []).length === 0 ? (
          <Vazio titulo="Nenhum cliente encontrado" descricao="Cadastre um cliente novo ou importe a carteira em Processos → Importar CSV." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Nome</TH>
                <TH>CPF/CNPJ</TH>
                <TH>Contato</TH>
                <TH>Processos</TH>
              </TR>
            </THead>
            <TBody>
              {(clientes ?? []).map((c) => (
                <TR key={c.id as string}>
                  <TD>
                    <Link href={`/clientes/${c.id}`} className="hover:underline">
                      {c.nome as string}
                    </Link>
                    {c.tipo_pessoa === "juridica" ? (
                      <Badge tom="contorno" className="ml-2">
                        PJ
                      </Badge>
                    ) : null}
                    {c.ativo === false ? (
                      <Badge tom="neutro" className="ml-2">
                        inativo
                      </Badge>
                    ) : null}
                  </TD>
                  <TD className="font-mono text-xs">{formatarDocumento(c.cpf_cnpj as string | null) || "—"}</TD>
                  <TD className="text-xs text-zinc-600 dark:text-zinc-300">
                    {(c.email as string | null) ?? ""}
                    {c.email && c.telefone_e164 ? " · " : ""}
                    {(c.telefone_e164 as string | null) ?? ""}
                    {!c.email && !c.telefone_e164 ? "—" : ""}
                  </TD>
                  <TD>{contagem.get(c.id as string) ?? 0}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      {totalPaginas > 1 ? (
        <nav className="flex items-center justify-between text-sm" aria-label="Paginação">
          {pagina > 1 ? <Link href={link(pagina - 1)}>← Anterior</Link> : <span />}
          <span className="text-zinc-500">
            Página {pagina} de {totalPaginas}
          </span>
          {pagina < totalPaginas ? <Link href={link(pagina + 1)}>Próxima →</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
