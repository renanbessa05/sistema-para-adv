import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerTextoPublicacao, listarCandidatasDuplicada, listarEventosPublicacao, listarMembros, listarPrazosDaPublicacao, listarProcessosParaVinculo, mapaNomes, obterPublicacao, obterTimezone } from "@/server/publicacoes";
import { ClassificacaoPublicacaoSchema } from "@/lib/ia/schemas/classificacao";
import { hojeNoFuso } from "@/lib/prazos/datas";
import { formatarData, formatarDataHora } from "@/lib/utils";
import { ROTULO_FONTE, ROTULO_STATUS_PUBLICACAO, ROTULO_TIPO_PUBLICACAO, TOM_STATUS_PUBLICACAO, formatarConfianca } from "@/components/dominio/CaixaPublicacoes";
import { CartaoPrazo, ROTULO_CONTAGEM } from "@/components/dominio/CartaoPrazo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm text-zinc-500">
            <Link href="/publicacoes" className="hover:underline">
              Publicações
            </Link>{" "}
            / detalhe
          </p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {pub.tipo ? ROTULO_TIPO_PUBLICACAO[pub.tipo] ?? pub.tipo : "Publicação"}
            <Badge tom={TOM_STATUS_PUBLICACAO[st] ?? "neutro"}>{ROTULO_STATUS_PUBLICACAO[st] ?? st}</Badge>
            {pub.sugere_sigilo ? <Badge tom="perigo">sugere sigilo</Badge> : null}
            {pub.revisar_classificacao ? <Badge tom="alerta">revisar classificação</Badge> : null}
            {pub.cancelada ? <Badge tom="contorno">cancelada pelo tribunal</Badge> : null}
          </h1>
        </div>
        {pub.link ? (
          <a href={pub.link} target="_blank" rel="noreferrer noopener" className="text-sm underline underline-offset-4">
            Abrir no DJEN
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
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Item rotulo="Processo">
                {pub.processo_id ? (
                  <Link href={`/processos/${pub.processo_id}`} className="font-mono hover:underline">
                    {pub.processos?.numero_cnj_mascara ?? pub.numero_processo_texto ?? pub.processo_id}
                  </Link>
                ) : (
                  <span>
                    <span className="text-zinc-500">sem processo na carteira</span>
                    {pub.numero_processo_texto ? <span className="block font-mono">{pub.numero_processo_texto}</span> : null}
                  </span>
                )}
                {pub.processos?.segredo_justica ? <Badge tom="perigo" className="ml-2">segredo de justiça</Badge> : null}
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
                  <Link href={`/publicacoes/${pub.publicacao_anterior_id}`} className="font-mono text-xs hover:underline">
                    {pub.publicacao_anterior_id}
                  </Link>
                </Item>
              ) : null}
              {pub.id_externo ? <Item rotulo="Id no DJEN">{pub.id_externo}</Item> : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumo da IA</CardTitle>
            <CardDescription>Sugestão do classificador. Confira com o texto antes de decidir.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {pub.resumo_ia ? <p>{pub.resumo_ia}</p> : <p className="text-zinc-500">Ainda não classificada.</p>}
            {pub.confianca_ia !== null ? <p className="mt-2 text-xs text-zinc-500">Confiança: {formatarConfianca(pub.confianca_ia)}</p> : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Classificação</CardTitle>
          </CardHeader>
          <CardContent>
            {classificacao.success ? (
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Item rotulo="Tipo">{ROTULO_TIPO_PUBLICACAO[classificacao.data.tipo] ?? classificacao.data.tipo}</Item>
                <Item rotulo="Gera prazo">{classificacao.data.gera_prazo ? <Badge tom="alerta">sim</Badge> : <Badge tom="neutro">não</Badge>}</Item>
                <Item rotulo="Ato">{classificacao.data.ato ?? "—"}</Item>
                <Item rotulo="Dias">{classificacao.data.dias_sugeridos !== null ? `${classificacao.data.dias_sugeridos} ${classificacao.data.contagem ? ROTULO_CONTAGEM[classificacao.data.contagem] ?? classificacao.data.contagem : ""}` : "—"}</Item>
                <Item rotulo="Prazo em dobro">{classificacao.data.dobro ? "sim" : "não"}</Item>
                <Item rotulo="Confiança">{formatarConfianca(classificacao.data.confianca)}</Item>
                <Item rotulo="CNJ no texto">{classificacao.data.numero_cnj ?? "—"}</Item>
                <Item rotulo="Classificado por">{pub.tipo_classificado_por ?? "—"}</Item>
                {classificacao.data.partes.length ? <Item rotulo="Partes">{classificacao.data.partes.map((p) => `${p.nome} (${p.polo})`).join("; ")}</Item> : null}
                {classificacao.data.observacoes ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-zinc-500">Observações</dt>
                    <dd className="text-amber-900 dark:text-amber-200">{classificacao.data.observacoes}</dd>
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
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Destinatários</p>
              {destinatarios.length ? (
                <ul className="space-y-0.5">
                  {destinatarios.map((d, i) => (
                    <li key={i}>
                      {d.nome ?? "—"} {d.polo ? <span className="text-zinc-500">({d.polo})</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-zinc-500">Nenhum.</p>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Advogados</p>
              {advogados.length ? (
                <ul className="space-y-0.5">
                  {advogados.map((a, i) => (
                    <li key={i}>
                      {a.nome ?? "—"} {a.numero_oab ? <span className="text-zinc-500">(OAB {a.numero_oab}{a.uf_oab ? `/${a.uf_oab}` : ""})</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-zinc-500">Nenhum.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Texto da publicação</CardTitle>
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
            <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-3 font-sans text-sm leading-relaxed dark:bg-zinc-900">{texto.texto}</pre>
          ) : (
            <p className="text-sm text-zinc-500">Sem texto gravado.</p>
          )}
        </CardContent>
      </Card>

      {temAcao ? (
        <Card>
          <CardHeader>
            <CardTitle>Ações</CardTitle>
            <CardDescription>Cada ação grava um evento. O banco confere papel e transição.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {acoes.cadastrar ? (
              <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="mb-2 font-medium">Cadastrar na carteira</p>
                <p className="mb-2 text-sm text-zinc-500">Cria o processo com o número desta publicação; depois vincule aqui.</p>
                <Link href={`/processos/novo?cnj=${pub.numero_cnj}&publicacao=${pub.id}`}>
                  <Button variante="secundaria" tamanho="sm">
                    Abrir cadastro de processo
                  </Button>
                </Link>
              </div>
            ) : null}

            {acoes.vincular ? (
              <form action={vincularPublicacao} className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <input type="hidden" name="id" value={pub.id} />
                <p className="font-medium">Vincular a processo</p>
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
                <Campo label="ou número CNJ">
                  <Input name="numero_cnj" placeholder="0000000-00.0000.8.11.0000" defaultValue={pub.numero_processo_texto ?? ""} />
                </Campo>
                <Button type="submit" tamanho="sm">
                  Vincular
                </Button>
              </form>
            ) : null}

            {acoes.ignorar ? (
              <form action={ignorarPublicacao} className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <input type="hidden" name="id" value={pub.id} />
                <p className="font-medium">Não é nosso (ignorar)</p>
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
                <Button type="submit" variante="contorno" tamanho="sm">
                  Ignorar publicação
                </Button>
              </form>
            ) : null}

            {acoes.semPrazo ? (
              <form action={marcarSemPrazo} className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <input type="hidden" name="id" value={pub.id} />
                <p className="font-medium">Sem prazo</p>
                <p className="text-sm text-zinc-500">Despacho de mero expediente ou comunicação que não abre prazo.</p>
                <Campo label="Motivo (opcional)">
                  <Input name="motivo" />
                </Campo>
                <Button type="submit" variante="contorno" tamanho="sm">
                  Marcar sem prazo
                </Button>
              </form>
            ) : null}

            {acoes.tratada ? (
              <form action={marcarTratada} className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <input type="hidden" name="id" value={pub.id} />
                <p className="font-medium">Ciente / tratada</p>
                <Campo label="Observação (opcional)">
                  <Input name="motivo" />
                </Campo>
                <Button type="submit" tamanho="sm">
                  Marcar como tratada
                </Button>
              </form>
            ) : null}

            {acoes.duplicada ? (
              <form action={marcarDuplicada} className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <input type="hidden" name="id" value={pub.id} />
                <p className="font-medium">Duplicada</p>
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
                <Button type="submit" variante="contorno" tamanho="sm">
                  Marcar duplicada
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Prazos ligados</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {prazos.length === 0 ? <p className="text-sm text-zinc-500">Nenhum prazo ligado a esta publicação.</p> : prazos.map((p) => <CartaoPrazo key={p.id} prazo={p} hoje={hoje} />)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Eventos</CardTitle>
          </CardHeader>
          <CardContent>
            {eventos.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhum evento.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {eventos.map((e) => {
                  const motivo = typeof e.dados?.motivo === "string" ? e.dados.motivo : null;
                  return (
                    <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 border-b border-zinc-100 pb-2 last:border-0 dark:border-zinc-800">
                      <span className="whitespace-nowrap text-xs text-zinc-500">{formatarDataHora(e.criado_em, timeZone)}</span>
                      <span>
                        {e.de_status ? ROTULO_STATUS_PUBLICACAO[e.de_status] ?? e.de_status : "captada"} → <strong>{ROTULO_STATUS_PUBLICACAO[e.para_status] ?? e.para_status}</strong>
                      </span>
                      <span className="text-zinc-500">{e.usuario_id ? nomes.get(e.usuario_id) ?? "usuário" : "sistema"}</span>
                      {motivo ? <span className="w-full text-zinc-600 dark:text-zinc-400">{motivo}</span> : null}
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

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}
