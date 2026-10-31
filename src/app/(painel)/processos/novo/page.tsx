import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { advogadosESocios, listarMembros, membrosComUsuario } from "@/server/equipe";
import { listarComarcas, podeEditarProcesso, podeMarcarSigilo, POLOS } from "@/server/processos";
import { tentarDecomporCnj } from "@/lib/cnj";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Campo, GrupoCampos, Input, Select, Textarea } from "@/components/ui/input";
import { Button, classesBotao } from "@/components/ui/button";
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
  const colaboradores = membrosComUsuario(membros);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="min-w-0">
        <Link href="/processos" className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-500 hover:text-marca-700">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Processos
        </Link>
        <h1 className="mt-1 text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Novo processo</h1>
        <p className="text-sm text-zinc-500">Ao salvar, o sistema cria as partes e consulta o DataJud para completar classe, órgão e movimentações.</p>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {cnj && !decomposto ? <Alert tom="alerta">O número informado na URL não é um CNJ válido; confira antes de salvar.</Alert> : null}
      {decomposto && decomposto.tribunalSigla && decomposto.tribunalSigla !== "TJMT" ? <Alert tom="info">Processo de {decomposto.tribunalSigla}: o calendário forense cadastrado é o do TJ-MT; prazos deste processo nascerão com aviso de calendário incompleto.</Alert> : null}

      <form action={criarProcesso} className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Processo</CardTitle>
            <CardDescription>O número CNJ é o único campo obrigatório; o resto o DataJud tenta completar.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <GrupoCampos titulo="Identificação" colunas={2}>
              <Campo label="Número CNJ" className="sm:col-span-2" dica="20 dígitos, com ou sem pontuação. Processos do TJ-MT terminam em 8.11.">
                <Input name="numero_cnj" required defaultValue={decomposto?.mascara ?? cnj ?? ""} placeholder="0000000-00.0000.8.11.0000" inputMode="numeric" minLength={20} maxLength={25} className="font-mono" />
              </Campo>
              <Campo label="Comarca (TJ-MT)" dica="Define o calendário forense usado na contagem dos prazos.">
                <Select name="comarca_id" defaultValue="">
                  <option value="">Deixar o DataJud preencher</option>
                  {comarcas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Responsável" dica="Quem decide os prazos e recebe os alertas.">
                <Select name="responsavel_id" defaultValue={sessao.papel === "advogado" || sessao.papel === "socio" ? sessao.usuarioId : ""}>
                  <option value="">Sem responsável (definir depois)</option>
                  {advogadosESocios(membros).map((m) => (
                    <option key={m.usuario_id} value={m.usuario_id}>
                      {m.nome_completo}
                    </option>
                  ))}
                </Select>
              </Campo>
            </GrupoCampos>

            <GrupoCampos titulo="Equipe e sigilo" descricao="Colaboradores acompanham o processo além do responsável." colunas={1}>
              <div>
                <p className="mb-1.5 text-[13px] font-semibold text-zinc-700">Colaboradores</p>
                <div className="flex flex-wrap gap-2 text-sm">
                  {colaboradores.map((m) => (
                    <label key={m.usuario_id} className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 shadow-xs transition-colors has-[:checked]:border-marca-300 has-[:checked]:bg-marca-50 has-[:checked]:text-marca-800 hover:border-zinc-300">
                      <input type="checkbox" name="colaboradores" value={m.usuario_id} className="h-3.5 w-3.5 rounded border-zinc-300 accent-marca-600" /> {m.nome_completo}
                    </label>
                  ))}
                  {colaboradores.length === 0 ? <span className="text-zinc-500">Nenhum membro com acesso ainda.</span> : null}
                </div>
              </div>
              {podeMarcarSigilo(sessao.papel) ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 text-sm has-[:checked]:border-red-200 has-[:checked]:bg-red-50/60">
                  <input type="checkbox" name="sigiloso" className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-red-600" />
                  <span>
                    <span className="block font-semibold text-zinc-900">Processo em segredo de justiça</span>
                    <span className="block text-xs text-zinc-500">Só responsável, colaboradores e sócios veem o texto das publicações.</span>
                  </span>
                </label>
              ) : null}
            </GrupoCampos>

            <GrupoCampos titulo="Observações" colunas={1}>
              <Campo label="Anotações internas da equipe">
                <Textarea name="observacoes" rows={2} className="min-h-20" />
              </Campo>
            </GrupoCampos>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cliente e partes</CardTitle>
            <CardDescription>Escolha um cliente já cadastrado ou informe um novo. A parte contrária entra no polo oposto.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <GrupoCampos titulo="Cliente" colunas={2}>
              <Campo label="Cliente cadastrado" className="sm:col-span-2" dica="Se o cliente ainda não existe, deixe em branco e preencha os campos abaixo.">
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
              <Campo label="Polo do cliente" dica="A parte contrária entra automaticamente no polo oposto.">
                <Select name="polo_cliente" defaultValue="ativo">
                  {Object.entries(POLOS).map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Campo>
            </GrupoCampos>
            <GrupoCampos titulo="Parte contrária" colunas={1}>
              <Campo label="Parte contrária">
                <Input name="parte_contraria" placeholder="Nome da parte contrária (opcional)" />
              </Campo>
            </GrupoCampos>
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <Link href="/processos" className={classesBotao({ variante: "contorno" })}>
            Cancelar
          </Link>
          <Button type="submit">Salvar e consultar DataJud</Button>
        </div>
      </form>
    </div>
  );
}
