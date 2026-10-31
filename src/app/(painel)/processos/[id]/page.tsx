import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, CalendarDays, Calculator, FileText, Gavel, Landmark, Lock, MapPin, Pencil, Plus, RefreshCw, ScanSearch, UserRound, Users } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { advogadosESocios, listarMembros, mapaNomes, membrosComUsuario } from "@/server/equipe";
import { COMPETENCIAS, formatarDocumento, formatarValor, listarComarcas, listarFases, podeAgirNoProcesso, podeEditarProcesso, podeMarcarSigilo, podeVerSigiloso, POLOS, SISTEMAS, STATUS_PROCESSO } from "@/server/processos";
import { STATUS_TAREFA } from "@/server/tarefas";
import { listarMinutas, ROTULO_STATUS_MINUTA } from "@/server/minutas";
import { listarParcelas, ROTULO_STATUS_CONTRATO } from "@/server/contratos";
import { ROTULO_AREA, ROTULO_TIPO_PECA } from "@/lib/ia/schemas/minutas";
import { horaLocal } from "@/lib/audiencias/datas";
import { hojeNoFuso } from "@/lib/prazos";
import { cn, formatarData, formatarDataHora } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button, classesBotao } from "@/components/ui/button";
import { Campo, GrupoCampos, Input, Select, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { adicionarColaborador, adicionarParte, alterarResponsavel, alterarSigilo, atualizarPeloDatajud, atualizarProcesso, moverFase, removerColaborador, removerParte } from "../actions";
import { CartaoDocumentos } from "@/components/dominio/CartaoDocumentos";
import { Abas, abaAtual } from "@/components/dominio/Abas";
import { DiaAgenda, ROTULO_STATUS_PRAZO, TOM_STATUS_PRAZO, urgenciaPrazo } from "@/components/dominio/CartaoPrazo";
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
  const hoje = hojeNoFuso(timeZone);
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

  const nomeCliente =
    (partes ?? [])
      .filter((p) => p.eh_cliente)
      .map((p) => p.nome as string)
      .join(", ") || null;
  const nomeResponsavel = processo.responsavel_id ? (nomes.get(processo.responsavel_id) ?? "membro") : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link href="/processos" className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-500 hover:text-marca-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Processos
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="font-mono text-[22px] leading-tight font-bold tracking-[-0.02em] text-zinc-950 sm:text-[26px]">{processo.numero_cnj_mascara}</h1>
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge tom={processo.status === "ativo" ? "sucesso" : processo.status === "suspenso" ? "alerta" : "neutro"}>{STATUS_PROCESSO[processo.status] ?? processo.status}</Badge>
              {processo.segredo_justica ? (
                <Badge tom="perigo">
                  <Lock className="h-3 w-3" aria-hidden />
                  sigiloso{processo.nivel_sigilo ? ` (nível ${processo.nivel_sigilo})` : ""}
                </Badge>
              ) : null}
              <Badge tom={processo.competencia === "juizado_especial" ? "alerta" : "contorno"}>{COMPETENCIAS[processo.competencia] ?? processo.competencia}</Badge>
            </span>
          </div>
          <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
            <Fato Icone={UserRound} rotulo="Cliente" valor={nomeCliente} vazio="sem cliente vinculado" />
            <Fato Icone={MapPin} rotulo="Comarca" valor={comarca} vazio="comarca não informada" />
            <Fato Icone={Gavel} rotulo="Fase" valor={fase?.nome ?? null} vazio="sem fase" />
            <Fato Icone={Users} rotulo="Responsável" valor={nomeResponsavel} vazio="sem responsável" />
          </dl>
        </div>
        <div className="flex flex-wrap gap-2 lg:shrink-0 lg:justify-end">
          {podeEditar ? (
            <Link href={modoEdicao ? `/processos/${id}` : `/processos/${id}?editar=1`} className={classesBotao({ variante: "contorno" })}>
              <Pencil aria-hidden />
              {modoEdicao ? "Fechar edição" : "Editar dados"}
            </Link>
          ) : null}
          <Link href={`/assistente?processo=${id}`} className={classesBotao({ variante: "contorno" })}>
            <Bot aria-hidden />
            Perguntar à assistente
          </Link>
          <form action={atualizarPeloDatajud.bind(null, id)}>
            <Button type="submit" variante="secundaria">
              <RefreshCw aria-hidden />
              Atualizar pelo DataJud
            </Button>
          </form>
          <Link href={`/minutas/nova?processo=${id}`} className={classesBotao({ variante: "primaria" })}>
            <Plus aria-hidden />
            Nova peça
          </Link>
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
                  <form action={atualizarProcesso.bind(null, id)} className="flex flex-col gap-5">
                    <GrupoCampos titulo="Situação e competência" colunas={2}>
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
                    </GrupoCampos>
                    <GrupoCampos titulo="Juízo e classe" descricao="O DataJud preenche estes campos quando encontra o processo; ajuste só se vier errado." colunas={2}>
                    <Campo label="Órgão julgador">
                      <Input name="orgao_julgador_nome" defaultValue={processo.orgao_julgador_nome ?? ""} />
                    </Campo>
                    <Campo label="Classe">
                      <Input name="classe_nome" defaultValue={processo.classe_nome ?? ""} />
                    </Campo>
                    <Campo label="Grau" dica="G1 para primeira instância, G2 para segunda.">
                      <Input name="grau" defaultValue={processo.grau ?? ""} placeholder="G1, G2…" />
                    </Campo>
                    <Campo label="Data de ajuizamento">
                      <Input name="data_ajuizamento" type="date" defaultValue={processo.data_ajuizamento ?? ""} />
                    </Campo>
                    <Campo label="Valor da causa (R$)" dica="Só números; use vírgula ou ponto para os centavos.">
                      <Input name="valor_causa" defaultValue={processo.valor_causa === null ? "" : String(processo.valor_causa)} inputMode="decimal" />
                    </Campo>
                    </GrupoCampos>
                    <GrupoCampos titulo="Observações" colunas={1}>
                    <Campo label="Anotações internas da equipe">
                      <Textarea name="observacoes" defaultValue={processo.observacoes ?? ""} rows={3} />
                    </Campo>
                    </GrupoCampos>
                    <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-4">
                      <Link href={`/processos/${id}`} className={classesBotao({ variante: "contorno" })}>
                        Cancelar
                      </Link>
                      <Button type="submit">Salvar</Button>
                    </div>
                  </form>
                ) : (
                  <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
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
                  <CardDescription>Quem decide os prazos e recebe os alertas deste processo.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm">
                  <p className="flex items-center gap-2.5">
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold", nomeResponsavel ? "bg-marca-50 text-marca-700" : "bg-zinc-100 text-zinc-400")} aria-hidden>
                      {nomeResponsavel ? nomeResponsavel.trim().charAt(0).toUpperCase() : <UserRound className="h-4 w-4" />}
                    </span>
                    {nomeResponsavel ? <span className="font-semibold text-zinc-950">{nomeResponsavel}</span> : <span className="text-zinc-500">Sem responsável</span>}
                  </p>
                  {sessao.papel === "socio" || sessao.papel === "advogado" ? (
                    <form action={alterarResponsavel.bind(null, id)} className="flex gap-2">
                      <Select name="responsavel_id" defaultValue={processo.responsavel_id ?? ""} aria-label="Novo responsável" className="min-w-0 flex-1">
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
                      <Select name="fase_id" defaultValue={processo.fase_id ?? ""} aria-label="Fase" className="min-w-0 flex-1">
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
                    <p className="font-semibold text-zinc-950">{fase?.nome ?? <span className="font-normal text-zinc-500">Sem fase</span>}</p>
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
                <CardDescription>Quem está em cada polo. A parte marcada como cliente liga o processo ao cadastro dela.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {(partes ?? []).length === 0 ? <VazioCartao texto="Nenhuma parte cadastrada." /> : null}
                <ul className="divide-y divide-zinc-100 text-sm">
                  {(partes ?? []).map((p) => (
                    <li key={p.id as string} className="flex items-center justify-between gap-3 py-2">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold", p.eh_cliente ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500")} aria-hidden>
                          {(p.nome as string).trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            {p.cliente_id ? (
                              <Link href={`/clientes/${p.cliente_id}`} className="truncate font-semibold text-zinc-950 hover:text-marca-700">
                                {p.nome as string}
                              </Link>
                            ) : (
                              <span className="truncate font-semibold text-zinc-900">{p.nome as string}</span>
                            )}
                            <Badge tom={p.eh_cliente ? "sucesso" : "contorno"}>{p.eh_cliente ? "cliente" : (POLOS[p.polo as string] ?? p.polo)}</Badge>
                          </span>
                          <span className="block truncate text-xs text-zinc-500 tabular-nums">
                            {p.eh_cliente ? (POLOS[p.polo as string] ?? p.polo) : null}
                            {p.eh_cliente && p.documento ? " · " : null}
                            {p.documento ? formatarDocumento(p.documento as string) : null}
                          </span>
                        </span>
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
                  <form action={adicionarParte.bind(null, id)} className="grid gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 p-3 sm:grid-cols-4">
                    <p className="text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase sm:col-span-4">Adicionar parte</p>
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
                    <Button type="submit" variante="secundaria" className="h-10">
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
                {colaboradorIds.length === 0 ? <VazioCartao texto="Nenhum colaborador." /> : null}
                <ul className="divide-y divide-zinc-100 text-sm">
                  {colaboradorIds.map((uid) => {
                    const nome = nomes.get(uid) ?? "membro";
                    return (
                      <li key={uid} className="flex items-center justify-between gap-3 py-2">
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-marca-50 text-xs font-bold text-marca-700" aria-hidden>
                            {nome.trim().charAt(0).toUpperCase()}
                          </span>
                          <span className="truncate font-semibold text-zinc-900">{nome}</span>
                        </span>
                        {podeEditar ? (
                          <form action={removerColaborador.bind(null, id, uid)}>
                            <Button type="submit" variante="fantasma" tamanho="sm">
                              Remover
                            </Button>
                          </form>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {podeEditar ? (
                  <form action={adicionarColaborador.bind(null, id)} className="flex gap-2">
                    <Select name="usuario_id" defaultValue="" aria-label="Membro" className="min-w-0 flex-1">
                      <option value="">Escolha um membro…</option>
                      {membrosComUsuario(membros)
                        .filter((m) => m.ativo && !colaboradorIds.includes(m.usuario_id) && m.usuario_id !== processo.responsavel_id)
                        .map((m) => (
                          <option key={m.usuario_id} value={m.usuario_id}>
                            {m.nome_completo}
                          </option>
                        ))}
                    </Select>
                    <Button type="submit" variante="secundaria" className="h-10">
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
            <CardContent className="flex flex-col gap-3">
              {(publicacoes ?? []).length === 0 ? (
                <VazioCartao texto="Nenhuma publicação vinculada.">
                  <Link href={`/publicacoes/nova?processo=${id}`} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                    Lançar intimação vista no PJe
                  </Link>
                </VazioCartao>
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
                        <TD className="whitespace-nowrap tabular-nums">
                          <Link href={`/publicacoes/${pub.id}`} className="font-semibold text-zinc-950 hover:text-marca-700">
                            {formatarData((pub.data_disponibilizacao ?? pub.data_publicacao) as string | null) || "—"}
                          </Link>
                        </TD>
                        <TD className="whitespace-nowrap text-zinc-700">{(pub.tipo as string | null) ?? (pub.tipo_documento as string | null) ?? "—"}</TD>
                        <TD className="min-w-[16rem] max-w-xl text-zinc-700">{veSigiloso ? ((pub.resumo_ia as string | null) ?? <span className="text-zinc-400">sem resumo</span>) : <span className="text-zinc-400">oculto (sigilo)</span>}</TD>
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
                <VazioCartao texto="Nenhuma movimentação registrada. Use &quot;Atualizar pelo DataJud&quot; no topo da página." />
              ) : (
                <ol className="relative flex flex-col border-l border-zinc-200 pl-5 text-sm">
                  {(movimentacoes ?? []).map((m, i) => (
                    <li key={m.id as string} className="relative pb-4 last:pb-0">
                      <span className={cn("absolute top-1.5 -left-[25px] h-[9px] w-[9px] rounded-full ring-4 ring-white", i === 0 ? "bg-marca-600" : "bg-zinc-300")} aria-hidden />
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                        <span className="text-xs font-semibold text-zinc-500 tabular-nums">{formatarDataHora(m.data as string, timeZone)}</span>
                        <Badge tom="contorno">{m.origem as string}</Badge>
                        {m.codigo_tpu ? <span className="font-mono text-[11px] text-zinc-400">TPU {m.codigo_tpu as number}</span> : null}
                      </div>
                      <p className="mt-0.5 font-medium text-zinc-900">{m.nome as string}</p>
                      {m.complemento ? <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{m.complemento as string}</p> : null}
                    </li>
                  ))}
                </ol>
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
                  <VazioCartao texto="Nenhum prazo neste processo." />
                ) : (
                  <ul className="divide-y divide-zinc-100 text-sm">
                    {(prazos ?? []).map((p) => {
                      const status = p.status as string;
                      const dataFinal = p.data_final as string;
                      return (
                        <li key={p.id as string} className="flex items-center gap-3 py-2">
                          <DiaAgenda data={dataFinal} urgencia={urgenciaPrazo(dataFinal, hoje, status)} />
                          <Link href={`/prazos/${p.id}`} className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-zinc-950 hover:text-marca-700">{(p.ato_descricao as string | null) ?? "Prazo"}</span>
                            <span className="block text-xs text-zinc-500 tabular-nums">
                              fatal {formatarData(dataFinal)}
                              {p.data_interna ? ` · interna ${formatarData(p.data_interna as string)}` : ""}
                            </span>
                          </Link>
                          <Badge tom={TOM_STATUS_PRAZO[status] ?? TOM_PRAZO[status] ?? "neutro"}>{ROTULO_STATUS_PRAZO[status] ?? status}</Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tarefas</CardTitle>
                <CardDescription>Trabalho distribuído à equipe a partir dos prazos e das decisões deste processo.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {(tarefas ?? []).length === 0 ? (
                  <VazioCartao texto="Nenhuma tarefa.">
                    <Link href={`/tarefas/nova?processo=${id}`} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                      <Plus aria-hidden />
                      Criar tarefa
                    </Link>
                  </VazioCartao>
                ) : (
                  <ul className="divide-y divide-zinc-100 text-sm">
                    {(tarefas ?? []).map((t) => {
                      const encerrada = t.status === "concluida" || t.status === "cancelada";
                      const atrasada = !encerrada && Boolean(t.vencimento) && (t.vencimento as string) < hoje;
                      return (
                        <li key={t.id as string} className="flex items-center gap-3 py-2">
                          <span className={cn("h-[18px] w-[18px] shrink-0 rounded-lg border-[1.5px]", t.status === "concluida" ? "border-emerald-300 bg-emerald-50" : atrasada ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white")} aria-hidden />
                          <Link href={`/tarefas/${t.id}`} className="min-w-0 flex-1">
                            <span className={cn("block truncate font-semibold hover:text-marca-700", encerrada ? "text-zinc-500" : "text-zinc-950")}>{t.titulo as string}</span>
                            <span className="block truncate text-xs text-zinc-500 tabular-nums">
                              {t.executor_id ? (nomes.get(t.executor_id as string) ?? "membro") : "sem executor"}
                              {t.vencimento ? ` · vence ${formatarData(t.vencimento as string)}` : ""}
                            </span>
                          </Link>
                          {atrasada ? <Badge tom="perigo">atrasada</Badge> : <Badge tom={t.status === "concluida" ? "sucesso" : t.status === "cancelada" ? "neutro" : "info"}>{STATUS_TAREFA[t.status as string] ?? t.status}</Badge>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {(tarefas ?? []).length > 0 ? (
                  <AcoesCartao>
                    <Link href={`/tarefas/nova?processo=${id}`} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                      <Plus aria-hidden />
                      Criar tarefa neste processo
                    </Link>
                  </AcoesCartao>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Audiências</CardTitle>
              <CardDescription>Alerta de véspera para o responsável e os sócios.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {audiencias.length === 0 ? (
                <VazioCartao texto="Nenhuma audiência.">
                  {["socio", "advogado"].includes(sessao.papel) ? (
                    <Link href={`/audiencias/nova?processo=${id}`} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                      <CalendarDays aria-hidden />
                      Marcar audiência
                    </Link>
                  ) : null}
                </VazioCartao>
              ) : (
                <ul className="divide-y divide-zinc-100 text-sm">
                  {audiencias.map((a) => {
                    const instante = new Date(a.data_hora);
                    const dataIso = new Intl.DateTimeFormat("sv-SE", { timeZone }).format(instante);
                    const urgencia = a.status === "realizada" || a.status === "cancelada" ? "encerrado" : urgenciaPrazo(dataIso, hoje, "confirmado");
                    return (
                      <li key={a.id} className="flex items-center gap-3 py-2">
                        <DiaAgenda data={dataIso} urgencia={urgencia === "vencido" ? "encerrado" : urgencia} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-zinc-950">{ROTULO_AUDIENCIA[a.tipo] ?? a.tipo}</span>
                          <span className="block text-xs text-zinc-500 tabular-nums">
                            {formatarData(dataIso)} às {horaLocal(instante, timeZone)} · {a.modalidade}
                          </span>
                        </span>
                        <Badge tom={a.status === "realizada" ? "sucesso" : a.status === "cancelada" ? "perigo" : "info"}>{a.status}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
              {audiencias.length > 0 && ["socio", "advogado"].includes(sessao.papel) ? (
                <AcoesCartao>
                  <Link href={`/audiencias/nova?processo=${id}`} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                    <CalendarDays aria-hidden />
                    Marcar audiência neste processo
                  </Link>
                </AcoesCartao>
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
            <CardContent className="flex flex-col gap-3">
              {minutas.length === 0 ? (
                <VazioCartao texto="Nenhuma peça neste processo.">
                  <Link href={`/minutas/nova?processo=${id}`} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                    <FileText aria-hidden />
                    Redigir peça
                  </Link>
                </VazioCartao>
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
                        <TD className="min-w-[12rem]">
                          <Link href={`/minutas/${m.id}`} className="font-semibold text-zinc-950 hover:text-marca-700">
                            {m.titulo}
                          </Link>
                        </TD>
                        <TD className="text-zinc-600">
                          {ROTULO_TIPO_PECA[m.tipo_peca]} · {ROTULO_AREA[m.area]} · modo {m.modo}
                        </TD>
                        <TD className="whitespace-nowrap text-zinc-600 tabular-nums">{m.modo === "C" ? `${Math.min(m.etapa_atual, 6)}/6` : "redação"}</TD>
                        <TD>
                          <Badge tom={TOM_MINUTA[m.status] ?? "neutro"}>{ROTULO_STATUS_MINUTA[m.status] ?? m.status}</Badge>
                        </TD>
                        <TD className="whitespace-nowrap text-xs text-zinc-500 tabular-nums">{formatarData(m.atualizado_em.slice(0, 10))}</TD>
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
                  <VazioCartao texto="Nenhuma análise gerada." />
                ) : (
                  <ul className="divide-y divide-zinc-100 text-sm">
                    {analises.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 py-2">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-marca-50 text-marca-600" aria-hidden>
                          <ScanSearch className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <Link href={linkDaAnalise(a, id)} className="block truncate font-semibold text-zinc-950 hover:text-marca-700">
                            {ROTULO_ANALISE[a.tipo] ?? a.tipo}
                          </Link>
                          <span className="block text-xs text-zinc-500 tabular-nums">
                            {formatarDataHora(a.criado_em, timeZone)}
                            {a.minuta_id ? (
                              <>
                                {" · "}
                                <Link href={`/minutas/${a.minuta_id}`} className="font-semibold text-marca-600 hover:underline">
                                  ver peça
                                </Link>
                              </>
                            ) : null}
                          </span>
                        </span>
                        <Badge tom="contorno">{a.status}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
                <AcoesCartao>
                  <Link href={`/varreduras/nova?processo=${id}`} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                    <ScanSearch aria-hidden />
                    Varrer os autos
                  </Link>
                  <Link href={`/processos/${id}/analises`} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                    <Gavel aria-hidden />
                    Mapa do julgador
                  </Link>
                  <Link href={`/processos/${id}/outros-tribunais`} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                    <Landmark aria-hidden />
                    Outros tribunais
                  </Link>
                </AcoesCartao>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cálculos</CardTitle>
                <CardDescription>Atualização de dívida e juros com índices do BCB, memória em PDF.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {calculos.length === 0 ? (
                  <VazioCartao texto="Nenhum cálculo." />
                ) : (
                  <ul className="divide-y divide-zinc-100 text-sm">
                    {calculos.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 py-2">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-600" aria-hidden>
                          <Calculator className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <Link href={`/calculos/${c.id}`} className="block truncate font-semibold text-zinc-950 hover:text-marca-700">
                            {c.titulo}
                          </Link>
                          <span className="block text-xs text-zinc-500 tabular-nums">atualizado {formatarData(c.atualizado_em.slice(0, 10))}</span>
                        </span>
                        <Badge tom="contorno">{c.status}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
                <AcoesCartao>
                  <Link href={`/calculos/novo?processo=${id}`} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                    <Calculator aria-hidden />
                    Novo cálculo
                  </Link>
                </AcoesCartao>
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
                <VazioCartao texto="Nenhum contrato ligado a este processo.">
                  {["socio", "advogado"].includes(sessao.papel) ? (
                    <Link href={`/contratos/novo?processo=${id}`} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                      Fazer a entrada do caso
                    </Link>
                  ) : null}
                </VazioCartao>
              ) : (
                <ul className="divide-y divide-zinc-100 text-sm">
                  {contratos.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 py-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-marca-50 text-marca-600" aria-hidden>
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <Link href={`/contratos/${c.id}`} className="block truncate font-semibold text-zinc-950 hover:text-marca-700">
                          {c.clientes?.nome ?? "Contrato"}
                        </Link>
                        <span className="block truncate text-xs text-zinc-500 tabular-nums">
                          {c.modalidade ? `${c.modalidade} · ` : ""}
                          {c.valor_fixo ? `${formatarValor(c.valor_fixo)} · ` : c.percentual_exito ? `${c.percentual_exito}% de êxito · ` : ""}
                          criado {formatarData(c.criado_em.slice(0, 10))}
                        </span>
                      </span>
                      <Badge tom={c.status === "assinado" ? "sucesso" : c.status === "cancelado" ? "neutro" : "info"}>{ROTULO_STATUS_CONTRATO[c.status] ?? c.status}</Badge>
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
              <CardContent className="flex flex-col gap-3">
                {parcelas.length === 0 ? (
                  <VazioCartao texto="Sem parcelas (honorários à vista ou por êxito)." />
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
                          <TD className="font-semibold text-zinc-950 tabular-nums">{p.numero}</TD>
                          <TD className="whitespace-nowrap tabular-nums">{formatarData(p.vencimento)}</TD>
                          <TD className="whitespace-nowrap font-medium tabular-nums">{formatarValor(p.valor)}</TD>
                          <TD>
                            <Badge tom={p.status === "paga" ? "sucesso" : p.status === "atrasada" ? "perigo" : p.status === "cancelada" ? "neutro" : "info"}>{p.status}</Badge>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
                <AcoesCartao>
                  <Link href={`/contratos/${contratos[0].id}`} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
                    Marcar parcelas no contrato
                  </Link>
                </AcoesCartao>
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
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase">{rotulo}</dt>
      <dd className="mt-0.5 text-sm leading-snug font-medium whitespace-pre-line text-zinc-900">{valor || <span className="font-normal text-zinc-400">—</span>}</dd>
    </div>
  );
}

/** "Fato" do cabeçalho: ícone + rótulo curto + valor, em linha. */
function Fato({ Icone, rotulo, valor, vazio }: { Icone: React.ComponentType<{ className?: string }>; rotulo: string; valor: string | null; vazio: string }) {
  return (
    <div className="inline-flex min-w-0 max-w-full items-center gap-1.5">
      <Icone className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
      <dt className="sr-only">{rotulo}</dt>
      <dd className={cn("truncate", valor ? "font-semibold text-zinc-800" : "text-zinc-400")} title={valor ?? undefined}>
        {valor ?? vazio}
      </dd>
    </div>
  );
}

/** Lista vazia dentro de um cartão, com ação opcional ao lado. */
function VazioCartao({ texto, children }: { texto: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-4 text-sm text-zinc-500">
      <span>{texto}</span>
      {children}
    </div>
  );
}

/** Rodapé de cartão com links secundários em forma de botão de contorno. */
function AcoesCartao({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-3">{children}</div>;
}
