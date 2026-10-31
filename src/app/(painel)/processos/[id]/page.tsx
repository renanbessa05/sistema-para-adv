import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { advogadosESocios, listarMembros, mapaNomes, membrosComUsuario } from "@/server/equipe";
import { COMPETENCIAS, formatarDocumento, formatarValor, listarComarcas, listarFases, podeAgirNoProcesso, podeEditarProcesso, podeMarcarSigilo, podeVerSigiloso, POLOS, SISTEMAS, STATUS_PROCESSO } from "@/server/processos";
import { STATUS_TAREFA } from "@/server/tarefas";
import { listarMinutas, ROTULO_STATUS_MINUTA } from "@/server/minutas";
import { listarParcelas, ROTULO_STATUS_CONTRATO } from "@/server/contratos";
import { ROTULO_AREA, ROTULO_TIPO_PECA } from "@/lib/ia/schemas/minutas";
import { horaLocal } from "@/lib/audiencias/datas";
import { formatarData, formatarDataHora } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { adicionarColaborador, adicionarParte, alterarResponsavel, alterarSigilo, atualizarPeloDatajud, atualizarProcesso, moverFase, removerColaborador, removerParte } from "../actions";
import { CartaoDocumentos } from "@/components/dominio/CartaoDocumentos";
import { Abas, abaAtual } from "@/components/dominio/Abas";
import { listarDocumentos } from "@/server/documentos";

export const metadata = { title: "Processo" };
export const dynamic = "force-dynamic";

type Processo = {
  id: string;
  numero_cnj: string;
  numero_cnj_mascara: string | null;
  tribunal_id: string | null;
  comarca_id: string | null;
  competencia: string;
  orgao_julgador_codigo: string | null;
  orgao_julgador_nome: string | null;
  grau: string | null;
  classe_codigo: number | null;
  classe_nome: string | null;
  sistema: string;
  data_ajuizamento: string | null;
  valor_causa: string | number | null;
  segredo_justica: boolean;
  nivel_sigilo: number | null;
  status: string;
  fase_id: string | null;
  fase_confirmada_em: string | null;
  responsavel_id: string | null;
  datajud_ultima_sincronizacao: string | null;
  datajud_ultima_atualizacao: string | null;
  datajud_indisponivel: boolean;
  observacoes: string | null;
  criado_em: string;
};

type Analise = { id: string; tipo: string; status: string; criado_em: string; minuta_id: string | null };
type Calculo = { id: string; titulo: string; tipo: string; status: string; atualizado_em: string };
type Audiencia = { id: string; tipo: string; data_hora: string; modalidade: string; status: string };
type Contrato = { id: string; status: string; modalidade: string | null; valor_fixo: number | string | null; percentual_exito: number | string | null; criado_em: string; cliente_id: string; clientes: { nome: string } | null };

const TOM_PRAZO: Record<string, "info" | "sucesso" | "alerta" | "perigo" | "neutro"> = { sugerido: "info", confirmado: "sucesso", prorrogado: "alerta", suspenso: "alerta", vencido: "perigo", cumprido: "neutro", cancelado: "neutro", rejeitado: "neutro" };
const TOM_MINUTA: Record<string, "info" | "sucesso" | "alerta" | "perigo" | "neutro"> = { rascunho: "neutro", em_etapas: "info", redigida: "info", em_revisao_ia: "info", aguardando_aprovacao: "alerta", devolvida: "perigo", aprovada: "sucesso", protocolada: "sucesso", arquivada: "neutro", cancelada: "neutro" };
const ROTULO_ANALISE: Record<string, string> = { varredura: "Varredura dos autos", mapa_julgador: "Mapa do julgador", camada_local: "Camada local", outros_tribunais: "Outros tribunais" };
const ROTULO_AUDIENCIA: Record<string, string> = { instrucao: "Instrução", conciliacao: "Conciliação", una: "Una", julgamento: "Julgamento", outra: "Outra" };

function linkDaAnalise(a: Analise, processoId: string): string {
  if (a.tipo === "varredura") return `/varreduras/${a.id}`;
  if (a.tipo === "mapa_julgador") return `/processos/${processoId}/analises`;
  return `/processos/${processoId}/outros-tribunais`;
}

export default async function PaginaProcesso({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string; aviso?: string; editar?: string; aba?: string }> }) {
  const sessao = await exigirSessao();
  const { id } = await params;
  const { erro, ok, aviso, editar, aba } = await searchParams;
  const supabase = await criarClienteServidor();

  const { data: bruto } = await supabase
    .from("processos")
    .select("id, numero_cnj, numero_cnj_mascara, tribunal_id, comarca_id, competencia, orgao_julgador_codigo, orgao_julgador_nome, grau, classe_codigo, classe_nome, sistema, data_ajuizamento, valor_causa, segredo_justica, nivel_sigilo, status, fase_id, fase_confirmada_em, responsavel_id, datajud_ultima_sincronizacao, datajud_ultima_atualizacao, datajud_indisponivel, observacoes, criado_em")
    .eq("id", id)
    .eq("escritorio_id", sessao.escritorioId)
    .maybeSingle();
  if (!bruto) notFound();
  const processo = bruto as unknown as Processo;

  const [
    { data: escritorio },
    membros,
    fases,
    { comarcas },
    { data: partes },
    { data: colaboradores },
    { data: movimentacoes },
    { data: publicacoes },
    { data: prazos },
    { data: tarefas },
    { data: clientes },
    documentos,
    minutas,
    { data: analisesData },
    { data: calculosData },
    { data: audienciasData },
    { data: contratosData },
  ] = await Promise.all([
    supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).maybeSingle(),
    listarMembros(supabase, sessao.escritorioId, { somenteAtivos: false }),
    listarFases(supabase, sessao.escritorioId),
    listarComarcas(supabase),
    supabase.from("processo_partes").select("id, nome, polo, cliente_id, eh_cliente, documento").eq("processo_id", id).order("polo").order("nome"),
    supabase.from("processo_colaboradores").select("usuario_id").eq("processo_id", id),
    supabase.from("movimentacoes").select("id, origem, codigo_tpu, nome, complemento, data").eq("processo_id", id).order("data", { ascending: false }).limit(30),
    supabase.from("publicacoes").select("id, data_disponibilizacao, data_publicacao, tipo, tipo_documento, resumo_ia, status").eq("processo_id", id).order("data_disponibilizacao", { ascending: false }).limit(50),
    supabase.from("prazos").select("id, ato_descricao, data_final, data_interna, status, responsavel_id").eq("processo_id", id).order("data_final", { ascending: false }).limit(100),
    supabase.from("tarefas").select("id, titulo, status, vencimento, executor_id, prioridade").eq("processo_id", id).order("vencimento", { ascending: true, nullsFirst: false }).limit(100),
    supabase.from("clientes").select("id, nome").eq("escritorio_id", sessao.escritorioId).eq("ativo", true).order("nome").limit(1000),
    listarDocumentos(supabase, { processoId: id }).catch(() => []),
    listarMinutas(supabase, { processoId: id }).catch(() => []),
    supabase.from("analises").select("id, tipo, status, criado_em, minuta_id").eq("processo_id", id).order("criado_em", { ascending: false }).limit(20),
    supabase.from("calculos").select("id, titulo, tipo, status, atualizado_em").eq("processo_id", id).order("atualizado_em", { ascending: false }).limit(20),
    supabase.from("audiencias").select("id, tipo, data_hora, modalidade, status").eq("processo_id", id).order("data_hora", { ascending: false }).limit(20),
    supabase.from("contratos").select("id, status, modalidade, valor_fixo, percentual_exito, criado_em, cliente_id, clientes(nome)").eq("processo_id", id).order("criado_em", { ascending: false }).limit(10),
  ]);

  const analises = (analisesData ?? []) as unknown as Analise[];
  const calculos = (calculosData ?? []) as unknown as Calculo[];
  const audiencias = (audienciasData ?? []) as unknown as Audiencia[];
  const contratos = (contratosData ?? []) as unknown as Contrato[];
  const parcelas = contratos[0] ? await listarParcelas(supabase, contratos[0].id).catch(() => []) : [];

  const timeZone = (escritorio?.timezone as string | undefined) ?? "America/Cuiaba";
  const nomes = mapaNomes(membros);
  const colaboradorIds = (colaboradores ?? []).map((c) => c.usuario_id as string);
  const podeEditar = podeEditarProcesso(sessao.papel);
  const podeAgir = podeAgirNoProcesso(sessao, processo, colaboradorIds);
  const veSigiloso = podeVerSigiloso(sessao, processo, colaboradorIds);
  const comarca = comarcas.find((c) => c.id === processo.comarca_id)?.nome ?? null;
  const fase = fases.find((f) => f.id === processo.fase_id) ?? null;
  const modoEdicao = editar === "1" && podeEditar;

  const prazosAbertos = (prazos ?? []).filter((p) => ["sugerido", "confirmado", "prorrogado", "suspenso", "vencido"].includes(p.status as string));
  const tarefasAbertas = (tarefas ?? []).filter((t) => !["concluida", "cancelada"].includes(t.status as string));
  const publicacoesPendentes = (publicacoes ?? []).filter((p) => ["nova", "classificada", "vinculada", "sem_processo", "com_prazo_sugerido"].includes(p.status as string));
  const pecasAbertas = minutas.filter((m) => !["protocolada", "arquivada", "cancelada"].includes(m.status));
  const parcelasPendentes = parcelas.filter((p) => p.status === "pendente" || p.status === "atrasada");

  const abas = [
    { chave: "geral", rotulo: "Visão geral" },
    { chave: "andamento", rotulo: "Andamento", contagem: (publicacoes ?? []).length, atencao: publicacoesPendentes.length > 0 },
    { chave: "prazos", rotulo: "Prazos e tarefas", contagem: prazosAbertos.length + tarefasAbertas.length, atencao: prazosAbertos.some((p) => p.status === "sugerido" || p.status === "vencido") },
    { chave: "pecas", rotulo: "Peças", contagem: minutas.length + analises.length + calculos.length, atencao: pecasAbertas.length > 0 },
    { chave: "documentos", rotulo: "Documentos", contagem: documentos.length },
    { chave: "contrato", rotulo: "Contrato", contagem: contratos.length, atencao: parcelasPendentes.some((p) => p.status === "atrasada") },
  ];
  const atual = modoEdicao ? "geral" : abaAtual(abas, aba);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/processos" className="text-sm text-zinc-500 hover:underline">
            ← Processos
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 font-mono text-xl font-semibold">
            {processo.numero_cnj_mascara}
            <Badge tom={processo.status === "ativo" ? "sucesso" : processo.status === "suspenso" ? "alerta" : "neutro"}>{STATUS_PROCESSO[processo.status] ?? processo.status}</Badge>
            {processo.segredo_justica ? <Badge tom="perigo">sigiloso{processo.nivel_sigilo ? ` (nível ${processo.nivel_sigilo})` : ""}</Badge> : null}
            <Badge tom={processo.competencia === "juizado_especial" ? "alerta" : "contorno"}>{COMPETENCIAS[processo.competencia] ?? processo.competencia}</Badge>
          </h1>
          <p className="text-sm text-zinc-500">
            {(partes ?? [])
              .filter((p) => p.eh_cliente)
              .map((p) => p.nome as string)
              .join(", ") || "sem cliente vinculado"}
            {fase ? ` · fase: ${fase.nome}` : ""}
            {processo.responsavel_id ? ` · ${nomes.get(processo.responsavel_id) ?? "membro"}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {podeEditar ? (
            <Link href={modoEdicao ? `/processos/${id}` : `/processos/${id}?editar=1`} className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
              {modoEdicao ? "Fechar edição" : "Editar dados"}
            </Link>
          ) : null}
          <Link href={`/minutas/nova?processo=${id}`} className="inline-flex h-9 items-center rounded-md bg-marca-600 px-4 text-sm text-white shadow-sm hover:bg-marca-700">
            Nova peça
          </Link>
          <Link href={`/assistente?processo=${id}`} className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Perguntar à assistente
          </Link>
          <form action={atualizarPeloDatajud.bind(null, id)}>
            <Button type="submit" variante="secundaria">
              Atualizar pelo DataJud
            </Button>
          </form>
        </div>
      </div>

      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      {aviso ? <Alert tom="alerta">{aviso}</Alert> : null}
      {processo.competencia === "juizado_especial" ? (
        <Alert tom="alerta" titulo="Juizado Especial: contagem de prazo exige conferência manual">
          A contagem em dias úteis nos Juizados não está validada (Lei 9.099/95; Enunciado 165 do FONAJE, a confirmar a prática do TJ-MT). Os prazos deste processo nascem com o aviso de calendário incompleto e só são confirmados após conferência da data. Se a competência estiver errada, corrija em &ldquo;Editar dados&rdquo;.
        </Alert>
      ) : null}
      {processo.datajud_indisponivel ? <Alert tom="alerta">O DataJud não devolveu este processo na última consulta (processo sigiloso, muito recente ou de outro tribunal). Os dados cadastrais ficam por conta da equipe.</Alert> : null}

      <Abas base={`/processos/${id}`} abas={abas} atual={atual} />

      {atual === "geral" ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Dados do processo</CardTitle>
                <CardDescription>
                  {processo.datajud_ultima_sincronizacao ? `Última consulta ao DataJud: ${formatarDataHora(processo.datajud_ultima_sincronizacao, timeZone)}` : "Ainda não consultado no DataJud."}
                  {processo.datajud_ultima_atualizacao ? ` · movimentação mais recente lá: ${formatarDataHora(processo.datajud_ultima_atualizacao, timeZone)}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {modoEdicao ? (
                  <form action={atualizarProcesso.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
                    <Campo label="Status">
                      <Select name="status" defaultValue={processo.status}>
                        {Object.entries(STATUS_PROCESSO).map(([v, r]) => (
                          <option key={v} value={v}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    </Campo>
                    <Campo label="Comarca">
                      <Select name="comarca_id" defaultValue={processo.comarca_id ?? ""}>
                        <option value="">—</option>
                        {comarcas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome}
                          </option>
                        ))}
                      </Select>
                    </Campo>
                    <Campo label="Competência">
                      <Select name="competencia" defaultValue={processo.competencia}>
                        {Object.entries(COMPETENCIAS).map(([v, r]) => (
                          <option key={v} value={v}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    </Campo>
                    <Campo label="Sistema">
                      <Select name="sistema" defaultValue={processo.sistema}>
                        {Object.entries(SISTEMAS).map(([v, r]) => (
                          <option key={v} value={v}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    </Campo>
                    <Campo label="Órgão julgador">
                      <Input name="orgao_julgador_nome" defaultValue={processo.orgao_julgador_nome ?? ""} />
                    </Campo>
                    <Campo label="Classe">
                      <Input name="classe_nome" defaultValue={processo.classe_nome ?? ""} />
                    </Campo>
                    <Campo label="Grau">
                      <Input name="grau" defaultValue={processo.grau ?? ""} placeholder="G1, G2…" />
                    </Campo>
                    <Campo label="Data de ajuizamento">
                      <Input name="data_ajuizamento" type="date" defaultValue={processo.data_ajuizamento ?? ""} />
                    </Campo>
                    <Campo label="Valor da causa (R$)">
                      <Input name="valor_causa" defaultValue={processo.valor_causa === null ? "" : String(processo.valor_causa)} inputMode="decimal" />
                    </Campo>
                    <Campo label="Observações" className="sm:col-span-2">
                      <Textarea name="observacoes" defaultValue={processo.observacoes ?? ""} rows={3} />
                    </Campo>
                    <div className="flex justify-end gap-2 sm:col-span-2">
                      <Button type="submit">Salvar</Button>
                    </div>
                  </form>
                ) : (
                  <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                    <Item rotulo="Tribunal" valor={processo.numero_cnj.slice(13, 14) === "8" && processo.numero_cnj.slice(14, 16) === "11" ? "TJ-MT" : `segmento ${processo.numero_cnj.slice(13, 14)}, tribunal ${processo.numero_cnj.slice(14, 16)}`} />
                    <Item rotulo="Comarca" valor={comarca} />
                    <Item rotulo="Órgão julgador" valor={processo.orgao_julgador_nome} />
                    <Item rotulo="Classe" valor={processo.classe_nome ? `${processo.classe_nome}${processo.classe_codigo ? ` (${processo.classe_codigo})` : ""}` : null} />
                    <Item rotulo="Grau" valor={processo.grau} />
                    <Item rotulo="Competência" valor={COMPETENCIAS[processo.competencia] ?? processo.competencia} />
                    <Item rotulo="Sistema" valor={SISTEMAS[processo.sistema] ?? processo.sistema} />
                    <Item rotulo="Data de ajuizamento" valor={formatarData(processo.data_ajuizamento)} />
                    <Item rotulo="Valor da causa" valor={formatarValor(processo.valor_causa)} />
                    <Item rotulo="Cadastrado em" valor={formatarDataHora(processo.criado_em, timeZone)} />
                    {processo.observacoes ? <Item rotulo="Observações" valor={processo.observacoes} className="sm:col-span-2" /> : null}
                  </dl>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Responsável</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  <p>{processo.responsavel_id ? (nomes.get(processo.responsavel_id) ?? "membro") : <span className="text-zinc-500">Sem responsável</span>}</p>
                  {sessao.papel === "socio" || sessao.papel === "advogado" ? (
                    <form action={alterarResponsavel.bind(null, id)} className="flex gap-2">
                      <Select name="responsavel_id" defaultValue={processo.responsavel_id ?? ""} aria-label="Novo responsável">
                        <option value="">Sem responsável</option>
                        {advogadosESocios(membros).map((m) => (
                          <option key={m.usuario_id} value={m.usuario_id}>
                            {m.nome_completo}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" variante="secundaria" tamanho="sm">
                        Trocar
                      </Button>
                    </form>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Fase</CardTitle>
                  <CardDescription>{processo.fase_confirmada_em ? `Confirmada em ${formatarDataHora(processo.fase_confirmada_em, timeZone)}` : "Ainda não confirmada por ninguém."}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm">
                  {podeEditar ? (
                    <form action={moverFase.bind(null, id)} className="flex gap-2">
                      <input type="hidden" name="voltar" value={`/processos/${id}`} />
                      <Select name="fase_id" defaultValue={processo.fase_id ?? ""} aria-label="Fase">
                        <option value="">Sem fase</option>
                        {fases.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.nome}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" variante="secundaria" tamanho="sm">
                        Mover
                      </Button>
                    </form>
                  ) : (
                    <p>{fase?.nome ?? "Sem fase"}</p>
                  )}
                </CardContent>
              </Card>

              {podeMarcarSigilo(sessao.papel) ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Sigilo</CardTitle>
                    <CardDescription>Em segredo de justiça, só responsável, colaboradores e sócios leem o texto das publicações.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form action={alterarSigilo.bind(null, id)} className="flex flex-wrap items-center gap-2 text-sm">
                      {processo.segredo_justica ? (
                        <>
                          <input type="hidden" name="sigiloso" value="0" />
                          <Button type="submit" variante="contorno" tamanho="sm">
                            Remover sigilo
                          </Button>
                        </>
                      ) : (
                        <>
                          <input type="hidden" name="sigiloso" value="1" />
                          <Select name="nivel" defaultValue="" className="w-40" aria-label="Nível de sigilo">
                            <option value="">Nível (opcional)</option>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>
                                Nível {n}
                              </option>
                            ))}
                          </Select>
                          <Button type="submit" variante="perigo" tamanho="sm">
                            Marcar sigiloso
                          </Button>
                        </>
                      )}
                    </form>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Partes</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {(partes ?? []).length === 0 ? <p className="text-sm text-zinc-500">Nenhuma parte cadastrada.</p> : null}
                <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                  {(partes ?? []).map((p) => (
                    <li key={p.id as string} className="flex items-center justify-between gap-2 py-1.5">
                      <span>
                        {p.cliente_id ? (
                          <Link href={`/clientes/${p.cliente_id}`} className="hover:underline">
                            {p.nome as string}
                          </Link>
                        ) : (
                          (p.nome as string)
                        )}
                        {p.documento ? <span className="ml-1 text-xs text-zinc-500">{formatarDocumento(p.documento as string)}</span> : null}
                        <Badge tom={p.eh_cliente ? "sucesso" : "contorno"} className="ml-2">
                          {p.eh_cliente ? "cliente" : POLOS[p.polo as string] ?? p.polo}
                        </Badge>
                        {p.eh_cliente ? <span className="ml-1 text-xs text-zinc-500">{POLOS[p.polo as string] ?? p.polo}</span> : null}
                      </span>
                      {podeEditar ? (
                        <form action={removerParte.bind(null, id, p.id as string)}>
                          <Button type="submit" variante="fantasma" tamanho="sm" aria-label={`Remover ${p.nome}`}>
                            Remover
                          </Button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {podeEditar ? (
                  <form action={adicionarParte.bind(null, id)} className="grid gap-2 rounded-md border border-dashed border-zinc-300 p-2 sm:grid-cols-4 dark:border-zinc-700">
                    <Select name="cliente_id" defaultValue="" aria-label="Cliente" className="sm:col-span-2">
                      <option value="">Não é cliente</option>
                      {(clientes ?? []).map((c) => (
                        <option key={c.id as string} value={c.id as string}>
                          cliente: {c.nome as string}
                        </option>
                      ))}
                    </Select>
                    <Input name="nome" placeholder="Nome da parte" className="sm:col-span-2" />
                    <Select name="polo" defaultValue="passivo" aria-label="Polo">
                      {Object.entries(POLOS).map(([v, r]) => (
                        <option key={v} value={v}>
                          {r}
                        </option>
                      ))}
                    </Select>
                    <Input name="documento" placeholder="CPF/CNPJ (opcional)" className="sm:col-span-2" />
                    <Button type="submit" variante="secundaria" tamanho="sm">
                      Adicionar parte
                    </Button>
                  </form>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Colaboradores</CardTitle>
                <CardDescription>Quem atua no processo além do responsável. Colaborador advogado também decide prazos.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {colaboradorIds.length === 0 ? <p className="text-sm text-zinc-500">Nenhum colaborador.</p> : null}
                <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                  {colaboradorIds.map((uid) => (
                    <li key={uid} className="flex items-center justify-between gap-2 py-1.5">
                      <span>{nomes.get(uid) ?? "membro"}</span>
                      {podeEditar ? (
                        <form action={removerColaborador.bind(null, id, uid)}>
                          <Button type="submit" variante="fantasma" tamanho="sm">
                            Remover
                          </Button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {podeEditar ? (
                  <form action={adicionarColaborador.bind(null, id)} className="flex gap-2">
                    <Select name="usuario_id" defaultValue="" aria-label="Membro">
                      <option value="">Escolha um membro…</option>
                      {membrosComUsuario(membros)
                        .filter((m) => m.ativo && !colaboradorIds.includes(m.usuario_id) && m.usuario_id !== processo.responsavel_id)
                        .map((m) => (
                          <option key={m.usuario_id} value={m.usuario_id}>
                            {m.nome_completo}
                          </option>
                        ))}
                    </Select>
                    <Button type="submit" variante="secundaria" tamanho="sm">
                      Adicionar
                    </Button>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      {atual === "andamento" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Publicações ligadas</CardTitle>
              <CardDescription>{veSigiloso ? "Resumo gerado pela IA; o texto completo e as decisões ficam na página da publicação." : "Processo sigiloso: seu papel vê só data e tipo."}</CardDescription>
            </CardHeader>
            <CardContent>
              {(publicacoes ?? []).length === 0 ? (
                <p className="text-sm text-zinc-500">
                  Nenhuma publicação vinculada.{" "}
                  <Link href={`/publicacoes/nova?processo=${id}`} className="underline">
                    Lançar intimação vista no PJe
                  </Link>
                </p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Data</TH>
                      <TH>Tipo</TH>
                      <TH>Resumo</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {(publicacoes ?? []).map((pub) => (
                      <TR key={pub.id as string}>
                        <TD className="whitespace-nowrap">
                          <Link href={`/publicacoes/${pub.id}`} className="hover:underline">
                            {formatarData((pub.data_disponibilizacao ?? pub.data_publicacao) as string | null) || "—"}
                          </Link>
                        </TD>
                        <TD>{(pub.tipo as string | null) ?? (pub.tipo_documento as string | null) ?? "—"}</TD>
                        <TD className="max-w-xl text-zinc-700 dark:text-zinc-300">{veSigiloso ? ((pub.resumo_ia as string | null) ?? <span className="text-zinc-400">sem resumo</span>) : <span className="text-zinc-400">oculto (sigilo)</span>}</TD>
                        <TD>
                          <Badge>{pub.status as string}</Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Movimentações</CardTitle>
              <CardDescription>Últimas 30, do DataJud e lançadas à mão.</CardDescription>
            </CardHeader>
            <CardContent>
              {(movimentacoes ?? []).length === 0 ? (
                <p className="text-sm text-zinc-500">Nenhuma movimentação registrada. Use &quot;Atualizar pelo DataJud&quot;.</p>
              ) : (
                <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                  {(movimentacoes ?? []).map((m) => (
                    <li key={m.id as string} className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-baseline sm:gap-3">
                      <span className="shrink-0 text-xs text-zinc-500">{formatarDataHora(m.data as string, timeZone)}</span>
                      <span>
                        {m.nome as string}
                        {m.codigo_tpu ? <span className="ml-1 text-xs text-zinc-400">TPU {m.codigo_tpu as number}</span> : null}
                        {m.complemento ? <span className="block text-xs text-zinc-500">{m.complemento as string}</span> : null}
                      </span>
                      <Badge tom="contorno" className="sm:ml-auto">
                        {m.origem as string}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {atual === "prazos" ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Prazos</CardTitle>
                <CardDescription>{podeAgir ? "Você pode confirmar e decidir os prazos deste processo." : "Decisão de prazo cabe ao responsável, colaborador advogado ou sócio."}</CardDescription>
              </CardHeader>
              <CardContent>
                {(prazos ?? []).length === 0 ? (
                  <p className="text-sm text-zinc-500">Nenhum prazo.</p>
                ) : (
                  <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                    {(prazos ?? []).map((p) => (
                      <li key={p.id as string} className="flex items-center justify-between gap-2 py-1.5">
                        <Link href={`/prazos/${p.id}`} className="hover:underline">
                          {(p.ato_descricao as string | null) ?? "Prazo"}
                        </Link>
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <Badge tom={TOM_PRAZO[p.status as string] ?? "neutro"}>{p.status as string}</Badge>
                          <span>{formatarData(p.data_final as string)}</span>
                          {p.data_interna ? <span className="text-xs text-zinc-500">interna {formatarData(p.data_interna as string)}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tarefas</CardTitle>
              </CardHeader>
              <CardContent>
                {(tarefas ?? []).length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    Nenhuma tarefa.{" "}
                    <Link href={`/tarefas/nova?processo=${id}`} className="underline">
                      Criar tarefa
                    </Link>
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                    {(tarefas ?? []).map((t) => (
                      <li key={t.id as string} className="flex items-center justify-between gap-2 py-1.5">
                        <Link href={`/tarefas/${t.id}`} className="hover:underline">
                          {t.titulo as string}
                        </Link>
                        <span className="flex items-center gap-2 whitespace-nowrap text-xs text-zinc-500">
                          {t.executor_id ? nomes.get(t.executor_id as string) : "sem executor"}
                          <Badge tom={t.status === "concluida" ? "sucesso" : t.status === "cancelada" ? "neutro" : "info"}>{STATUS_TAREFA[t.status as string] ?? t.status}</Badge>
                          {t.vencimento ? formatarData(t.vencimento as string) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {(tarefas ?? []).length > 0 ? (
                  <p className="mt-2 text-xs">
                    <Link href={`/tarefas/nova?processo=${id}`} className="underline">
                      Criar tarefa neste processo
                    </Link>
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Audiências</CardTitle>
              <CardDescription>Alerta de véspera para o responsável e os sócios.</CardDescription>
            </CardHeader>
            <CardContent>
              {audiencias.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  Nenhuma audiência.{" "}
                  {["socio", "advogado"].includes(sessao.papel) ? (
                    <Link href={`/audiencias/nova?processo=${id}`} className="underline">
                      Marcar audiência
                    </Link>
                  ) : null}
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                  {audiencias.map((a) => {
                    const instante = new Date(a.data_hora);
                    return (
                      <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
                        <span>
                          {ROTULO_AUDIENCIA[a.tipo] ?? a.tipo} <span className="text-xs text-zinc-500">· {a.modalidade}</span>
                        </span>
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <Badge tom={a.status === "realizada" ? "sucesso" : a.status === "cancelada" ? "perigo" : "info"}>{a.status}</Badge>
                          <span>
                            {formatarData(new Intl.DateTimeFormat("sv-SE", { timeZone }).format(instante))} {horaLocal(instante, timeZone)}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {audiencias.length > 0 && ["socio", "advogado"].includes(sessao.papel) ? (
                <p className="mt-2 text-xs">
                  <Link href={`/audiencias/nova?processo=${id}`} className="underline">
                    Marcar audiência neste processo
                  </Link>
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}

      {atual === "pecas" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Peças</CardTitle>
              <CardDescription>Minutas deste processo, em qualquer modo. Peça aprovada e protocolada fecha a tarefa e o prazo ligados.</CardDescription>
            </CardHeader>
            <CardContent>
              {minutas.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  Nenhuma peça.{" "}
                  <Link href={`/minutas/nova?processo=${id}`} className="underline">
                    Redigir peça
                  </Link>
                </p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Título</TH>
                      <TH>Peça</TH>
                      <TH>Etapa</TH>
                      <TH>Status</TH>
                      <TH>Atualizada</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {minutas.map((m) => (
                      <TR key={m.id}>
                        <TD>
                          <Link href={`/minutas/${m.id}`} className="hover:underline">
                            {m.titulo}
                          </Link>
                        </TD>
                        <TD>
                          {ROTULO_TIPO_PECA[m.tipo_peca]} · {ROTULO_AREA[m.area]} · modo {m.modo}
                        </TD>
                        <TD>{m.modo === "C" ? `${Math.min(m.etapa_atual, 6)}/6` : "redação"}</TD>
                        <TD>
                          <Badge tom={TOM_MINUTA[m.status] ?? "neutro"}>{ROTULO_STATUS_MINUTA[m.status] ?? m.status}</Badge>
                        </TD>
                        <TD className="whitespace-nowrap text-xs text-zinc-500">{formatarData(m.atualizado_em.slice(0, 10))}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Análises</CardTitle>
                <CardDescription>Varredura dos autos a favor do cliente, mapa do julgador (previsão neutra) e camada local de outros tribunais.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {analises.length === 0 ? (
                  <p className="text-sm text-zinc-500">Nenhuma análise gerada.</p>
                ) : (
                  <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                    {analises.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
                        <Link href={linkDaAnalise(a, id)} className="hover:underline">
                          {ROTULO_ANALISE[a.tipo] ?? a.tipo}
                        </Link>
                        <span className="flex items-center gap-2 whitespace-nowrap text-xs text-zinc-500">
                          {a.minuta_id ? (
                            <Link href={`/minutas/${a.minuta_id}`} className="underline">
                              peça
                            </Link>
                          ) : null}
                          <Badge tom="contorno">{a.status}</Badge>
                          {formatarDataHora(a.criado_em, timeZone)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2 text-xs">
                  <Link href={`/varreduras/nova?processo=${id}`} className="rounded-md border border-zinc-300 px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700">
                    Varrer os autos
                  </Link>
                  <Link href={`/processos/${id}/analises`} className="rounded-md border border-zinc-300 px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700">
                    Mapa do julgador
                  </Link>
                  <Link href={`/processos/${id}/outros-tribunais`} className="rounded-md border border-zinc-300 px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700">
                    Outros tribunais
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cálculos</CardTitle>
                <CardDescription>Atualização de dívida e juros com índices do BCB, memória em PDF.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {calculos.length === 0 ? (
                  <p className="text-sm text-zinc-500">Nenhum cálculo.</p>
                ) : (
                  <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                    {calculos.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                        <Link href={`/calculos/${c.id}`} className="hover:underline">
                          {c.titulo}
                        </Link>
                        <span className="flex items-center gap-2 whitespace-nowrap text-xs text-zinc-500">
                          <Badge tom="contorno">{c.status}</Badge>
                          {formatarData(c.atualizado_em.slice(0, 10))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="text-xs">
                  <Link href={`/calculos/novo?processo=${id}`} className="rounded-md border border-zinc-300 px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700">
                    Novo cálculo
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      {atual === "documentos" ? <CartaoDocumentos documentos={documentos} voltar={`/processos/${id}?aba=documentos`} processoId={id} papel={sessao.papel} timeZone={timeZone} /> : null}

      {atual === "contrato" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Contrato de honorários</CardTitle>
              <CardDescription>Entrada do caso: diagnóstico, cálculo pela Tabela OAB/MT, documentos e assinatura.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {contratos.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  Nenhum contrato ligado a este processo.{" "}
                  {["socio", "advogado"].includes(sessao.papel) ? (
                    <Link href={`/contratos/novo?processo=${id}`} className="underline">
                      Fazer a entrada do caso
                    </Link>
                  ) : null}
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                  {contratos.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                      <Link href={`/contratos/${c.id}`} className="hover:underline">
                        {c.clientes?.nome ?? "Contrato"}
                        {c.modalidade ? <span className="ml-1 text-xs text-zinc-500">· {c.modalidade}</span> : null}
                      </Link>
                      <span className="flex items-center gap-2 whitespace-nowrap text-xs text-zinc-500">
                        {c.valor_fixo ? formatarValor(c.valor_fixo) : c.percentual_exito ? `${c.percentual_exito}% de êxito` : null}
                        <Badge tom={c.status === "assinado" ? "sucesso" : c.status === "cancelado" ? "neutro" : "info"}>{ROTULO_STATUS_CONTRATO[c.status] ?? c.status}</Badge>
                        {formatarData(c.criado_em.slice(0, 10))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {contratos[0] ? (
            <Card>
              <CardHeader>
                <CardTitle>Parcelas</CardTitle>
                <CardDescription>
                  Do contrato mais recente. {parcelasPendentes.length ? `${parcelasPendentes.length} em aberto.` : "Nada em aberto."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {parcelas.length === 0 ? (
                  <p className="text-sm text-zinc-500">Sem parcelas (honorários à vista ou por êxito).</p>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Nº</TH>
                        <TH>Vencimento</TH>
                        <TH>Valor</TH>
                        <TH>Status</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {parcelas.map((p) => (
                        <TR key={p.id}>
                          <TD>{p.numero}</TD>
                          <TD className="whitespace-nowrap">{formatarData(p.vencimento)}</TD>
                          <TD>{formatarValor(p.valor)}</TD>
                          <TD>
                            <Badge tom={p.status === "paga" ? "sucesso" : p.status === "atrasada" ? "perigo" : p.status === "cancelada" ? "neutro" : "info"}>{p.status}</Badge>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
                <p className="mt-2 text-xs">
                  <Link href={`/contratos/${contratos[0].id}`} className="underline">
                    Marcar parcelas no contrato
                  </Link>
                </p>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Item({ rotulo, valor, className }: { rotulo: string; valor: string | null | undefined; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{rotulo}</dt>
      <dd className="whitespace-pre-line">{valor || <span className="text-zinc-400">—</span>}</dd>
    </div>
  );
}
