import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { advogadosESocios, listarMembros, membrosComUsuario } from "@/server/equipe";
import { listarComarcas, podeEditarProcesso, podeMarcarSigilo, POLOS } from "@/server/processos";
import { tentarDecomporCnj } from "@/lib/cnj";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Campo, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { criarProcesso } from "../actions";

export const metadata = { title: "Novo processo" };
export const dynamic = "force-dynamic";

export default async function PaginaNovoProcesso({ searchParams }: { searchParams: Promise<{ cnj?: string; erro?: string; cliente?: string }> }) {
  const sessao = await exigirSessao();
  if (!podeEditarProcesso(sessao.papel)) redirect(`/processos?erro=${encodeURIComponent("Estagiário não cadastra processo: peça a um advogado ou ao administrativo.")}`);
  const { cnj, erro, cliente } = await searchParams;
  const supabase = await criarClienteServidor();

  const [{ data: clientes }, membros, { comarcas }] = await Promise.all([
    supabase.from("clientes").select("id, nome").eq("escritorio_id", sessao.escritorioId).eq("ativo", true).order("nome").limit(1000),
    listarMembros(supabase, sessao.escritorioId),
    listarComarcas(supabase),
  ]);
  const decomposto = cnj ? tentarDecomporCnj(cnj) : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <Link href="/processos" className="text-sm text-zinc-500 hover:underline">
          ← Processos
        </Link>
        <h1 className="text-xl font-semibold">Novo processo</h1>
        <p className="text-sm text-zinc-500">Ao salvar, o sistema cria as partes e consulta o DataJud para completar classe, órgão e movimentações.</p>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {cnj && !decomposto ? <Alert tom="alerta">O número informado na URL não é um CNJ válido; confira antes de salvar.</Alert> : null}
      {decomposto && decomposto.tribunalSigla && decomposto.tribunalSigla !== "TJMT" ? <Alert tom="info">Processo de {decomposto.tribunalSigla}: o calendário forense cadastrado é o do TJ-MT; prazos deste processo nascerão com aviso de calendário incompleto.</Alert> : null}

      <form action={criarProcesso} className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Processo</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Campo label="Número CNJ" className="sm:col-span-2">
              <Input name="numero_cnj" required defaultValue={decomposto?.mascara ?? cnj ?? ""} placeholder="0000000-00.0000.8.11.0000" inputMode="numeric" pattern="[0-9.\-\s]{20,25}" title="20 dígitos, com ou sem máscara" />
            </Campo>
            <Campo label="Comarca (TJ-MT)">
              <Select name="comarca_id" defaultValue="">
                <option value="">Deixar o DataJud preencher</option>
                {comarcas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Responsável">
              <Select name="responsavel_id" defaultValue={sessao.papel === "advogado" || sessao.papel === "socio" ? sessao.usuarioId : ""}>
                <option value="">Sem responsável (definir depois)</option>
                {advogadosESocios(membros).map((m) => (
                  <option key={m.usuario_id} value={m.usuario_id}>
                    {m.nome_completo}
                  </option>
                ))}
              </Select>
            </Campo>
            <div className="sm:col-span-2">
              <p className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Colaboradores</p>
              <div className="flex flex-wrap gap-3 text-sm">
                {membrosComUsuario(membros).map((m) => (
                  <label key={m.usuario_id} className="inline-flex items-center gap-1.5">
                    <input type="checkbox" name="colaboradores" value={m.usuario_id} /> {m.nome_completo}
                  </label>
                ))}
                {membrosComUsuario(membros).length === 0 ? <span className="text-zinc-500">Nenhum membro com acesso ainda.</span> : null}
              </div>
            </div>
            {podeMarcarSigilo(sessao.papel) ? (
              <label className="inline-flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="sigiloso" /> Processo em segredo de justiça (só responsável, colaboradores e sócios veem o texto das publicações)
              </label>
            ) : null}
            <Campo label="Observações" className="sm:col-span-2">
              <Textarea name="observacoes" rows={2} />
            </Campo>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cliente e partes</CardTitle>
            <CardDescription>Escolha um cliente já cadastrado ou informe um novo. A parte contrária entra no polo oposto.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Campo label="Cliente cadastrado" className="sm:col-span-2">
              <Select name="cliente_id" defaultValue={cliente ?? ""}>
                <option value="">— cliente novo (preencha abaixo) —</option>
                {(clientes ?? []).map((c) => (
                  <option key={c.id as string} value={c.id as string}>
                    {c.nome as string}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Nome do cliente novo">
              <Input name="cliente_nome" placeholder="Só se não escolheu acima" />
            </Campo>
            <Campo label="CPF/CNPJ do cliente novo">
              <Input name="cliente_documento" placeholder="somente números" inputMode="numeric" />
            </Campo>
            <Campo label="Tipo de pessoa (cliente novo)">
              <Select name="cliente_tipo" defaultValue="fisica">
                <option value="fisica">Pessoa física</option>
                <option value="juridica">Pessoa jurídica</option>
              </Select>
            </Campo>
            <Campo label="Polo do cliente">
              <Select name="polo_cliente" defaultValue="ativo">
                {Object.entries(POLOS).map(([v, r]) => (
                  <option key={v} value={v}>
                    {r}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Parte contrária" className="sm:col-span-2">
              <Input name="parte_contraria" placeholder="Nome da parte contrária (opcional)" />
            </Campo>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Link href="/processos" className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Cancelar
          </Link>
          <Button type="submit">Salvar e consultar DataJud</Button>
        </div>
      </form>
    </div>
  );
}
