import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, CheckCircle2, Copy, ExternalLink, FileText, FolderPlus, Link2, MinusCircle, Sparkles } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerTextoPublicacao, listarCandidatasDuplicada, listarEventosPublicacao, listarMembros, listarPrazosDaPublicacao, listarProcessosParaVinculo, mapaNomes, obterPublicacao, obterTimezone } from "@/server/publicacoes";
import { ClassificacaoPublicacaoSchema } from "@/lib/ia/schemas/classificacao";
import { hojeNoFuso } from "@/lib/prazos/datas";
import { cn, formatarData, formatarDataHora } from "@/lib/utils";
import { ROTULO_FONTE, ROTULO_STATUS_PUBLICACAO, ROTULO_TIPO_PUBLICACAO, TOM_STATUS_PUBLICACAO, formatarConfianca } from "@/components/dominio/CaixaPublicacoes";
import { CartaoPrazo, ROTULO_CONTAGEM } from "@/components/dominio/CartaoPrazo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button, classesBotao } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/input";
import { ignorarPublicacao, marcarDuplicada, marcarSemPrazo, marcarTratada, vincularPublicacao } from "../actions";
import { ProximoPasso } from "@/components/dominio/ProximoPasso";

export const metadata = { title: "Publicação" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Pessoa = { nome?: string | null; polo?: string | null; numero_oab?: string | null; uf_oab?: string | null };

function comoPessoas(valor: unknown): Pessoa[] {
  if (!Array.isArray(valor)) return [];
  return valor.map((v) => (typeof v === "string" ? { nome: v } : typeof v === "object" && v !== null ? (v as Pessoa) : { nome: String(v) }));
}

export default async function PaginaPublicacao({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  const { id } = await params;
  const { erro, ok } = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await criarClienteServidor();

  const pub = await obterPublicacao(supabase, id);
  if (!pub) notFound();

  const [texto, prazos, eventos, membros, timeZone, processos, candidatas, tribunal] = await Promise.all([
    lerTextoPublicacao(supabase, id),
    listarPrazosDaPublicacao(supabase, id),
    listarEventosPublicacao(supabase, id),
    listarMembros(supabase),
    obterTimezone(supabase, sessao.escritorioId),
    listarProcessosParaVinculo(supabase),
    listarCandidatasDuplicada(supabase, pub),
    pub.tribunal_id ? supabase.schema("ref").from("tribunais").select("sigla, nome").eq("id", pub.tribunal_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const nomes = mapaNomes(membros);
  const hoje = hojeNoFuso(timeZone);
  const classificacao = ClassificacaoPublicacaoSchema.safeParse(pub.classificacao);
  const destinatarios = comoPessoas(pub.destinatarios);
  const advogados = comoPessoas(pub.destinatario_advogados);
  const tribunalInfo = (tribunal?.data as { sigla?: string; nome?: string } | null) ?? null;

  // Ações visíveis por estado e papel (docs/regras/estados.md). A segurança real é a RPC.
  const papel = sessao.papel;
  const podeTudo = papel === "socio" || papel === "advogado";
  const podeAdmin = podeTudo || papel === "administrativo";
  const st = pub.status;
  const acoes = {
    cadastrar: podeAdmin && ["sem_processo", "classificada"].includes(st) && !!pub.numero_cnj,
    vincular: (podeTudo && ["classificada", "sem_processo"].includes(st)) || (papel === "administrativo" && st === "sem_processo"),
    ignorar: podeAdmin && st === "sem_processo",
    semPrazo: podeTudo && st === "vinculada",
    tratada: podeTudo && st === "sem_prazo",
    duplicada: podeAdmin && !["duplicada", "arquivada"].includes(st),
  };
  const temAcao = Object.values(acoes).some(Boolean);

  // Fio: o que fazer agora com esta publicação, e para onde ir.
  const prazoSugerido = prazos.find((p) => p.status === "sugerido") ?? null;
  const geraPrazo = classificacao.success ? classificacao.data.gera_prazo : null;
  const extrasFio = [
    ...(pub.processo_id ? [{ href: `/processos/${pub.processo_id}?aba=andamento`, rotulo: "processo" }] : []),
    ...prazos.map((p) => ({ href: `/prazos/${p.id}`, rotulo: `prazo (${p.status})` })),
  ];
  const passo = (() => {
    if (st === "nova") return { titulo: "Aguardando a classificação automática", descricao: "A IA lê a publicação a cada 5 minutos em dias úteis e sugere tipo, processo e prazo." };
    if (st === "classificada" || st === "sem_processo") {
      if (acoes.cadastrar) return { tom: "alerta" as const, titulo: "Processo não está na carteira: cadastre ou vincule", descricao: "Cadastre com o número desta publicação, vincule a um processo existente ou marque «não é nosso» no fim da página.", href: `/processos/novo?cnj=${pub.numero_cnj}&publicacao=${pub.id}`, rotulo: "Cadastrar na carteira" };
      return { tom: "alerta" as const, titulo: "Vincule a um processo ou marque «não é nosso»", descricao: "As ações estão no fim da página. Vinculada, a publicação segue para o prazo." };
    }
    if (st === "vinculada" || st === "com_prazo_sugerido") {
      if (prazoSugerido) return { tom: "alerta" as const, titulo: `Confirme o prazo sugerido: ${prazoSugerido.ato_descricao ?? "ato a praticar"}`, descricao: `Data final sugerida ${formatarData(prazoSugerido.data_final)}. Confira a memória de cálculo antes de confirmar.`, href: `/prazos/${prazoSugerido.id}`, rotulo: "Confirmar prazo" };
      if (prazos.length > 0) return { titulo: "Prazos desta publicação já decididos", descricao: "Acompanhe pelo prazo ou pela tarefa ligada." };
      if (geraPrazo === false) return { titulo: "A IA entendeu que não abre prazo", descricao: "Se concorda, marque «Sem prazo» no fim da página; depois, «Ciente / tratada»." };
      return { titulo: "Esta publicação abre prazo?", descricao: "Se não abre, marque «Sem prazo» no fim da página. Se abre e nenhum prazo foi sugerido, confira a classificação e lance o prazo pelo processo." };
    }
    if (st === "sem_prazo") return { titulo: "Marque como ciente / tratada", descricao: "Última etapa: registra que alguém leu e decidiu. A ação está no fim da página." };
    if (st === "tratada") return { concluido: true, titulo: "Publicação tratada", descricao: prazos.length ? "Os prazos ligados estão decididos." : "Nada mais a fazer aqui." };
    return null;
  })();

  const numeroProcesso = pub.processos?.numero_cnj_mascara ?? pub.numero_processo_texto ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] text-zinc-500">
            <Link href="/publicacoes" className="font-semibold text-marca-600 hover:underline">
              Publicações
            </Link>
            <span className="mx-1.5 text-zinc-300">/</span>
            detalhe
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">
            {pub.tipo ? ROTULO_TIPO_PUBLICACAO[pub.tipo] ?? pub.tipo : "Publicação"}
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge tom={TOM_STATUS_PUBLICACAO[st] ?? "neutro"}>{ROTULO_STATUS_PUBLICACAO[st] ?? st}</Badge>
              {pub.sugere_sigilo ? <Badge tom="perigo">sugere sigilo</Badge> : null}
              {pub.revisar_classificacao ? <Badge tom="alerta">revisar classificação</Badge> : null}
              {pub.cancelada ? <Badge tom="contorno">cancelada pelo tribunal</Badge> : null}
            </span>
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-zinc-500">
            {numeroProcesso ? <span className="font-mono text-xs text-zinc-700">{numeroProcesso}</span> : <span>sem número de processo</span>}
            {pub.data_disponibilizacao ? <span>· disponibilizada {formatarData(pub.data_disponibilizacao)}</span> : null}
            <span>· {ROTULO_FONTE[pub.fonte] ?? pub.fonte}</span>
          </p>
        </div>
        {pub.link ? (
          <a href={pub.link} target="_blank" rel="noreferrer noopener" className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
            Abrir no DJEN
            <ExternalLink aria-hidden />
          </a>
        ) : null}
      </div>

      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      {passo ? <ProximoPasso {...passo} extras={extrasFio} /> : null}
      {pub.cancelada ? (
        <Alert tom="alerta" titulo="Publicação cancelada pelo tribunal">
          {pub.motivo_cancelamento ?? "Sem motivo informado."} {pub.data_cancelamento ? `(${formatarDataHora(pub.data_cancelamento, timeZone)})` : null}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Cabeçalho</CardTitle>
            <CardDescription>Dados vindos da fonte e do processo na carteira.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Item rotulo="Processo">
                {pub.processo_id ? (
                  <Link href={`/processos/${pub.processo_id}`} className="font-mono text-[13px] font-semibold text-marca-700 hover:underline">
                    {pub.processos?.numero_cnj_mascara ?? pub.numero_processo_texto ?? pub.processo_id}
                  </Link>
                ) : (
                  <span>
                    <span className="text-zinc-500">sem processo na carteira</span>
                    {pub.numero_processo_texto ? <span className="block font-mono text-[13px]">{pub.numero_processo_texto}</span> : null}
                  </span>
                )}
                {pub.processos?.segredo_justica ? (
                  <Badge tom="perigo" className="ml-2">
                    segredo de justiça
                  </Badge>
                ) : null}
              </Item>
              <Item rotulo="Responsável">{pub.processos?.responsavel_id ? nomes.get(pub.processos.responsavel_id) ?? "—" : "—"}</Item>
              <Item rotulo="Órgão">{pub.orgao ?? pub.processos?.orgao_julgador_nome ?? "—"}</Item>
              <Item rotulo="Classe">{pub.classe ?? pub.processos?.classe_nome ?? "—"}</Item>
              <Item rotulo="Fonte">
                {ROTULO_FONTE[pub.fonte] ?? pub.fonte}
                {tribunalInfo?.sigla ? ` · ${tribunalInfo.sigla}` : ""}
                {pub.meio ? ` · ${pub.meio}` : ""}
              </Item>
              <Item rotulo="Tipo informado pela fonte">{[pub.tipo_origem, pub.tipo_documento].filter(Boolean).join(" · ") || "—"}</Item>
              <Item rotulo="Disponibilização">{formatarData(pub.data_disponibilizacao) || "—"}</Item>
              <Item rotulo="Publicação">{formatarData(pub.data_publicacao) || "—"}</Item>
              <Item rotulo="Captada em">{formatarDataHora(pub.criado_em, timeZone)}</Item>
              <Item rotulo="Vínculo">
                {pub.vinculo_tipo ?? "—"}
                {pub.motivo_nao_e_nosso ? ` · ${pub.motivo_nao_e_nosso}` : ""}
              </Item>
              {pub.tratada_em ? <Item rotulo="Tratada">{`${formatarDataHora(pub.tratada_em, timeZone)}${pub.tratada_por ? ` por ${nomes.get(pub.tratada_por) ?? "usuário"}` : ""}${pub.motivo_tratamento ? ` · ${pub.motivo_tratamento}` : ""}`}</Item> : null}
              {pub.publicacao_anterior_id ? (
                <Item rotulo="Duplicada de">
                  <Link href={`/publicacoes/${pub.publicacao_anterior_id}`} className="font-mono text-xs text-marca-700 hover:underline">
                    {pub.publicacao_anterior_id}
                  </Link>
                </Item>
              ) : null}
              {pub.id_externo ? (
                <Item rotulo="Id no DJEN">
                  <span className="font-mono text-xs">{pub.id_externo}</span>
                </Item>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card className="border-marca-100 bg-gradient-to-b from-marca-50/60 to-white to-[90px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-marca-600" aria-hidden />
              Resumo da IA
            </CardTitle>
            <CardDescription>Sugestão do classificador. Confira com o texto antes de decidir.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {pub.resumo_ia ? <p className="text-sm leading-relaxed text-zinc-800">{pub.resumo_ia}</p> : <p className="text-sm text-zinc-500">Ainda não classificada.</p>}
            {pub.confianca_ia !== null ? (
              <p className="flex items-center justify-between rounded-lg bg-white/80 px-3 py-2 text-xs text-zinc-500 ring-1 ring-zinc-200/80">
                Confiança do classificador
                <span className="font-bold text-zinc-900 tabular-nums">{formatarConfianca(pub.confianca_ia)}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Classificação</CardTitle>
            <CardDescription>O que a IA extraiu do texto.</CardDescription>
          </CardHeader>
          <CardContent>
            {classificacao.success ? (
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Item rotulo="Tipo">{ROTULO_TIPO_PUBLICACAO[classificacao.data.tipo] ?? classificacao.data.tipo}</Item>
                <Item rotulo="Gera prazo">{classificacao.data.gera_prazo ? <Badge tom="alerta">sim</Badge> : <Badge tom="neutro">não</Badge>}</Item>
                <Item rotulo="Ato">{classificacao.data.ato ?? "—"}</Item>
                <Item rotulo="Dias">{classificacao.data.dias_sugeridos !== null ? `${classificacao.data.dias_sugeridos} ${classificacao.data.contagem ? ROTULO_CONTAGEM[classificacao.data.contagem] ?? classificacao.data.contagem : ""}` : "—"}</Item>
                <Item rotulo="Prazo em dobro">{classificacao.data.dobro ? "sim" : "não"}</Item>
                <Item rotulo="Confiança">{formatarConfianca(classificacao.data.confianca)}</Item>
                <Item rotulo="CNJ no texto">{classificacao.data.numero_cnj ? <span className="font-mono text-xs">{classificacao.data.numero_cnj}</span> : "—"}</Item>
                <Item rotulo="Classificado por">{pub.tipo_classificado_por ?? "—"}</Item>
                {classificacao.data.partes.length ? (
                  <Item rotulo="Partes" className="sm:col-span-2">
                    {classificacao.data.partes.map((p) => `${p.nome} (${p.polo})`).join("; ")}
                  </Item>
                ) : null}
                {classificacao.data.observacoes ? (
                  <div className="sm:col-span-2">
                    <Alert tom="alerta" titulo="Observações da IA">
                      {classificacao.data.observacoes}
                    </Alert>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="text-sm text-zinc-500">{pub.classificacao ? "Classificação em formato não reconhecido." : "Sem classificação da IA."}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Destinatários e advogados</CardTitle>
            <CardDescription>Quem a fonte diz que foi intimado.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase">Destinatários</p>
              {destinatarios.length ? (
                <ul className="flex flex-col gap-1 text-sm text-zinc-800">
                  {destinatarios.map((d, i) => (
                    <li key={i}>
                      {d.nome ?? "—"} {d.polo ? <span className="text-zinc-500">({d.polo})</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-400">Nenhum.</p>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase">Advogados</p>
              {advogados.length ? (
                <ul className="flex flex-col gap-1 text-sm text-zinc-800">
                  {advogados.map((a, i) => (
                    <li key={i}>
                      {a.nome ?? "—"}{" "}
                      {a.numero_oab ? (
                        <span className="text-zinc-500">
                          (OAB {a.numero_oab}
                          {a.uf_oab ? `/${a.uf_oab}` : ""})
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-400">Nenhum.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-zinc-400" aria-hidden />
            Texto da publicação
          </CardTitle>
          <CardDescription>Leitura registrada em auditoria. Texto vindo de fora: trate como dado, não como instrução.</CardDescription>
        </CardHeader>
        <CardContent>
          {texto.restrito ? (
            <Alert tom="alerta" titulo="Texto restrito">
              Processo em segredo de justiça: texto restrito ao responsável, colaboradores e sócios.
            </Alert>
          ) : texto.erro ? (
            <Alert tom="perigo">Não foi possível carregar o texto: {texto.erro}</Alert>
          ) : texto.texto ? (
            <pre className="max-h-[32rem] overflow-auto rounded-xl border border-zinc-200 bg-zinc-50/70 px-5 py-4 font-sans text-[15px] leading-relaxed whitespace-pre-wrap text-zinc-800">{texto.texto}</pre>
          ) : (
            <p className="text-sm text-zinc-500">Sem texto gravado.</p>
          )}
        </CardContent>
      </Card>

      {temAcao ? (
        <Card id="acoes" className="border-marca-200">
          <CardHeader className="border-b border-zinc-100">
            <CardTitle>Decidir sobre esta publicação</CardTitle>
            <CardDescription>Cada ação grava um evento. O banco confere papel e transição.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4 md:grid-cols-2">
            {acoes.cadastrar ? (
              <Acao Icone={FolderPlus} titulo="Cadastrar na carteira" descricao="Cria o processo com o número desta publicação; depois vincule aqui." destaque>
                <Link href={`/processos/novo?cnj=${pub.numero_cnj}&publicacao=${pub.id}`} className={classesBotao({ variante: "secundaria", tamanho: "sm", className: "self-start" })}>
                  Abrir cadastro de processo
                </Link>
              </Acao>
            ) : null}

            {acoes.vincular ? (
              <form action={vincularPublicacao} className="contents">
                <Acao Icone={Link2} titulo="Vincular a processo" descricao="Escolha um processo da carteira ou informe o número CNJ." destaque>
                  <input type="hidden" name="id" value={pub.id} />
                  <Campo label="Processo da carteira">
                    <Select name="processo_id" defaultValue="">
                      <option value="">— escolher —</option>
                      {processos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.numero_cnj_mascara ?? p.numero_cnj}
                          {p.responsavel_id && nomes.get(p.responsavel_id) ? ` · ${nomes.get(p.responsavel_id)}` : ""}
                        </option>
                      ))}
                    </Select>
                  </Campo>
                  <Campo label="ou número CNJ" dica="Use quando o processo ainda não aparece na lista.">
                    <Input name="numero_cnj" placeholder="0000000-00.0000.8.11.0000" defaultValue={pub.numero_processo_texto ?? ""} className="font-mono" />
                  </Campo>
                  <Button type="submit" tamanho="sm" className="self-start">
                    Vincular
                  </Button>
                </Acao>
              </form>
            ) : null}

            {acoes.semPrazo ? (
              <form action={marcarSemPrazo} className="contents">
                <Acao Icone={MinusCircle} titulo="Sem prazo" descricao="Despacho de mero expediente ou comunicação que não abre prazo." destaque>
                  <input type="hidden" name="id" value={pub.id} />
                  <Campo label="Motivo (opcional)">
                    <Input name="motivo" />
                  </Campo>
                  <Button type="submit" tamanho="sm" className="self-start">
                    Marcar sem prazo
                  </Button>
                </Acao>
              </form>
            ) : null}

            {acoes.tratada ? (
              <form action={marcarTratada} className="contents">
                <Acao Icone={CheckCircle2} titulo="Ciente / tratada" descricao="Registra que alguém leu e decidiu. Fecha o fio desta publicação." destaque>
                  <input type="hidden" name="id" value={pub.id} />
                  <Campo label="Observação (opcional)">
                    <Input name="motivo" />
                  </Campo>
                  <Button type="submit" tamanho="sm" className="self-start">
                    Marcar como tratada
                  </Button>
                </Acao>
              </form>
            ) : null}

            {acoes.ignorar ? (
              <form action={ignorarPublicacao} className="contents">
                <Acao Icone={Ban} titulo="Não é nosso (ignorar)" descricao="Homônimo ou processo de colega: sai da caixa sem gerar prazo.">
                  <input type="hidden" name="id" value={pub.id} />
                  <Campo label="Motivo">
                    <Select name="motivo_tipo" defaultValue="homonimo">
                      <option value="homonimo">Homônimo</option>
                      <option value="processo_de_colega">Processo de colega</option>
                      <option value="outro">Outro</option>
                    </Select>
                  </Campo>
                  <Campo label="Detalhe (obrigatório em «Outro»)">
                    <Input name="motivo_texto" />
                  </Campo>
                  <Button type="submit" variante="contorno" tamanho="sm" className="self-start">
                    Ignorar publicação
                  </Button>
                </Acao>
              </form>
            ) : null}

            {acoes.duplicada ? (
              <form action={marcarDuplicada} className="contents">
                <Acao Icone={Copy} titulo="Duplicada" descricao="Mesma comunicação já captada antes por outra fonte.">
                  <input type="hidden" name="id" value={pub.id} />
                  <Campo label="Publicação anterior (mesmo número)">
                    {candidatas.length ? (
                      <Select name="publicacao_anterior_id" defaultValue={candidatas[0].id}>
                        {candidatas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {formatarData(c.data_disponibilizacao) || "sem data"} · {c.tipo ? ROTULO_TIPO_PUBLICACAO[c.tipo] ?? c.tipo : "sem tipo"} · {ROTULO_STATUS_PUBLICACAO[c.status] ?? c.status}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input name="publicacao_anterior_id" placeholder="identificador da publicação anterior" />
                    )}
                  </Campo>
                  <Button type="submit" variante="contorno" tamanho="sm" className="self-start">
                    Marcar duplicada
                  </Button>
                </Acao>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Prazos ligados</CardTitle>
            <CardDescription>Prazos sugeridos ou confirmados a partir desta publicação.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {prazos.length === 0 ? <p className="py-2 text-sm text-zinc-400">Nenhum prazo ligado a esta publicação.</p> : prazos.map((p) => <CartaoPrazo key={p.id} prazo={p} hoje={hoje} />)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Eventos</CardTitle>
            <CardDescription>Cada mudança de status, com quem decidiu.</CardDescription>
          </CardHeader>
          <CardContent>
            {eventos.length === 0 ? (
              <p className="py-2 text-sm text-zinc-400">Nenhum evento.</p>
            ) : (
              <ol className="relative flex flex-col gap-3 border-l border-zinc-200 pl-4">
                {eventos.map((e) => {
                  const motivo = typeof e.dados?.motivo === "string" ? e.dados.motivo : null;
                  return (
                    <li key={e.id} className="relative text-sm">
                      <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-white bg-marca-400 ring-1 ring-zinc-200" aria-hidden />
                      <p className="text-xs text-zinc-500 tabular-nums">
                        {formatarDataHora(e.criado_em, timeZone)} · {e.usuario_id ? nomes.get(e.usuario_id) ?? "usuário" : "sistema"}
                      </p>
                      <p className="text-zinc-800">
                        {e.de_status ? ROTULO_STATUS_PUBLICACAO[e.de_status] ?? e.de_status : "captada"} → <strong className="font-semibold text-zinc-950">{ROTULO_STATUS_PUBLICACAO[e.para_status] ?? e.para_status}</strong>
                      </p>
                      {motivo ? <p className="text-[13px] text-zinc-600">{motivo}</p> : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Item({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase">{rotulo}</dt>
      <dd className="mt-0.5 text-sm text-zinc-900 break-words">{children}</dd>
    </div>
  );
}

/** Bloco de uma decisão: ícone, título, explicação curta e o formulário embaixo. */
function Acao({ Icone, titulo, descricao, destaque = false, children }: { Icone: React.ComponentType<{ className?: string }>; titulo: string; descricao: string; destaque?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3 rounded-xl border p-4", destaque ? "border-marca-200 bg-marca-50/40" : "border-zinc-200 bg-white")}>
      <div className="flex items-start gap-3">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", destaque ? "bg-marca-100 text-marca-700" : "bg-zinc-100 text-zinc-500")} aria-hidden>
          <Icone className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-zinc-950">{titulo}</p>
          <p className="text-[13px] leading-snug text-zinc-500">{descricao}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
