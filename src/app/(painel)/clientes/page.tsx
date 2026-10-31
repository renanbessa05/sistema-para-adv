import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText, Mail, MessageCircle, Phone, Plus, Search } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarDocumento, podeEditarProcesso } from "@/server/processos";
import { Input } from "@/components/ui/input";
import { Button, classesBotao } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, Vazio } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";

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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Clientes</h1>
          <p className="text-sm text-zinc-500">
            <span className="font-semibold text-zinc-700 tabular-nums">{total}</span> cliente(s){inativos === "1" ? ", incluindo inativos" : " ativos"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/contratos" className={classesBotao({ variante: "contorno" })}>
            <FileText aria-hidden />
            Contratos
          </Link>
          {sessao.papel === "socio" || sessao.papel === "advogado" ? (
            <Link href="/atendimento" className={classesBotao({ variante: "contorno" })}>
              <MessageCircle aria-hidden />
              Atendimento (WhatsApp)
            </Link>
          ) : null}
          {podeEditarProcesso(sessao.papel) ? (
            <Link href="/clientes/novo" className={classesBotao({ variante: "primaria" })}>
              <Plus aria-hidden />
              Novo cliente
            </Link>
          ) : null}
        </div>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      {error ? <Alert tom="perigo">Não foi possível carregar: {error.message}</Alert> : null}

      <form method="get" className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-xs sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
          <Input name="busca" defaultValue={busca} placeholder="Nome, e-mail ou CPF/CNPJ" className="pl-9" aria-label="Busca" />
        </div>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-[13px] font-medium text-zinc-600 select-none hover:text-zinc-900">
          <input type="checkbox" name="inativos" value="1" defaultChecked={inativos === "1"} className="h-4 w-4 rounded border-zinc-300 accent-marca-600" /> incluir inativos
        </label>
        <Button type="submit" variante="secundaria" className="h-10">
          Buscar
        </Button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        {(clientes ?? []).length === 0 ? (
          <Vazio titulo="Nenhum cliente encontrado" descricao="Cadastre um cliente novo ou importe a carteira em Processos → Importar CSV." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Nome</TH>
                <TH className="hidden sm:table-cell">CPF/CNPJ</TH>
                <TH className="hidden md:table-cell">Contato</TH>
                <TH className="text-right">Processos</TH>
              </TR>
            </THead>
            <TBody>
              {(clientes ?? []).map((c) => {
                const nome = c.nome as string;
                const inativo = c.ativo === false;
                const n = contagem.get(c.id as string) ?? 0;
                return (
                  <TR key={c.id as string}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold", inativo ? "bg-zinc-100 text-zinc-400" : "bg-marca-50 text-marca-700")} aria-hidden>
                          {nome.trim().charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <Link href={`/clientes/${c.id}`} className={cn("truncate font-semibold hover:text-marca-700", inativo ? "text-zinc-500" : "text-zinc-950")}>
                              {nome}
                            </Link>
                            {c.tipo_pessoa === "juridica" ? <Badge tom="contorno">PJ</Badge> : null}
                            {inativo ? <Badge tom="neutro">inativo</Badge> : null}
                          </div>
                          <p className="truncate font-mono text-xs text-zinc-500 sm:hidden">{formatarDocumento(c.cpf_cnpj as string | null) || (c.email as string | null) || (c.telefone_e164 as string | null) || ""}</p>
                        </div>
                      </div>
                    </TD>
                    <TD className="hidden font-mono text-xs whitespace-nowrap text-zinc-700 sm:table-cell">{formatarDocumento(c.cpf_cnpj as string | null) || <span className="text-zinc-300">—</span>}</TD>
                    <TD className="hidden text-xs text-zinc-600 md:table-cell">
                      {c.email || c.telefone_e164 ? (
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          {c.email ? (
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                              <span className="truncate">{c.email as string}</span>
                            </span>
                          ) : null}
                          {c.telefone_e164 ? (
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
                              <Phone className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                              {c.telefone_e164 as string}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      <span className={cn("inline-flex min-w-7 justify-center rounded-full px-2 text-xs font-bold leading-5 tabular-nums", n ? "bg-marca-50 text-marca-700" : "bg-zinc-100 text-zinc-400")}>{n}</span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>

      {totalPaginas > 1 ? (
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Paginação">
          {pagina > 1 ? (
            <Link href={link(pagina - 1)} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
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
            <Link href={link(pagina + 1)} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
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
