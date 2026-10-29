import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarMembros, mapaNomes, obterTimezone } from "@/server/publicacoes";
import { ehTipoDivergencia, listarDivergencias, naoExplicada, resumoSemanal, ROTULO_TIPO_DIVERGENCIA, TIPOS_DIVERGENCIA, type TipoDivergencia } from "@/server/divergencias";
import { hojeNoFuso } from "@/lib/prazos/datas";
import { formatarData, formatarDataHora } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Campo, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, Vazio } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { registrar, resolver } from "./actions";

export const metadata = { title: "Divergências" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITUACOES = ["abertas", "resolvidas", "todas"] as const;
type Situacao = (typeof SITUACOES)[number];

type Params = { erro?: string; ok?: string; prazo?: string; publicacao?: string; semana?: string; tipo?: string; situacao?: string };

/** Operação paralela: registro semanal do que divergiu entre o sistema e o PJe (docs/runbooks/operacao-paralela.md). */
export default async function PaginaDivergencias({ searchParams }: { searchParams: Promise<Params> }) {
  const sessao = await exigirSessao();
  // Estagiário lê (a RLS libera o select); registrar e resolver são de sócio, advogado e administrativo
  const podeRegistrar = sessao.papel !== "estagiario";
  const q = await searchParams;
  const supabase = await criarClienteServidor();

  const timeZone = await obterTimezone(supabase, sessao.escritorioId);
  const hoje = hojeNoFuso(timeZone);
  const filtroSemana = q.semana && /^\d{4}-\d{2}-\d{2}$/.test(q.semana) ? q.semana : null;
  const filtroTipo: TipoDivergencia | null = q.tipo && ehTipoDivergencia(q.tipo) ? q.tipo : null;
  const situacao: Situacao = (SITUACOES as readonly string[]).includes(q.situacao ?? "") ? (q.situacao as Situacao) : "abertas";

  const prazoId = q.prazo && UUID.test(q.prazo) ? q.prazo : null;
  const publicacaoId = q.publicacao && UUID.test(q.publicacao) ? q.publicacao : null;

  const [resumo, lista, membros, { data: prazo }, { data: publicacao }] = await Promise.all([
    resumoSemanal(supabase, hoje),
    listarDivergencias(supabase, { semana: filtroSemana, tipo: filtroTipo, situacao }),
    listarMembros(supabase),
    prazoId ? supabase.from("prazos").select("id, processo_id, ato_descricao, data_final, processos(numero_cnj_mascara)").eq("id", prazoId).maybeSingle() : Promise.resolve({ data: null }),
    publicacaoId ? supabase.from("publicacoes").select("id, processo_id, numero_cnj, tipo, data_disponibilizacao").eq("id", publicacaoId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const nomes = mapaNomes(membros);

  const prazoPre = prazo as { id: string; processo_id: string; ato_descricao: string | null; data_final: string; processos: { numero_cnj_mascara: string | null } | null } | null;
  const pubPre = publicacao as { id: string; processo_id: string | null; numero_cnj: string | null; tipo: string | null; data_disponibilizacao: string | null } | null;
  const processoPre = prazoPre?.processo_id ?? pubPre?.processo_id ?? "";
  const tipoPre: TipoDivergencia = prazoPre ? "data_prazo" : pubPre ? (pubPre.processo_id ? "classificacao_errada" : "publicacao_nao_captada") : "data_prazo";
  const descricaoPre = prazoPre
    ? `Prazo "${prazoPre.ato_descricao ?? "sem ato"}" do processo ${prazoPre.processos?.numero_cnj_mascara ?? "—"}: sistema ${formatarData(prazoPre.data_final)}, PJe `
    : pubPre
      ? `Publicação de ${formatarData(pubPre.data_disponibilizacao) || "—"}${pubPre.numero_cnj ? ` (${pubPre.numero_cnj})` : ""}: `
      : "";

  const atingiuMeta = resumo.semanasConsecutivasLimpas >= resumo.meta;
  const filtrosAtivos = Boolean(filtroSemana || filtroTipo || situacao !== "abertas");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Divergências da operação paralela</h1>
        <p className="text-sm text-zinc-500">
          Toda sexta, cruze os prazos do sistema com o PJe e registre aqui o que divergiu. Divergência sem causa preenchida conta como &quot;não explicada&quot; e zera a contagem. Runbook: <code>docs/runbooks/operacao-paralela.md</code>.
        </p>
      </div>

      {q.erro ? <Alert tom="perigo">{q.erro}</Alert> : null}
      {q.ok ? <Alert tom="sucesso">{q.ok}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao
          titulo="Semanas consecutivas limpas"
          valor={`${resumo.semanasConsecutivasLimpas} / ${resumo.meta}`}
          detalhe={resumo.totalRegistradas === 0 ? "Nenhuma conferência registrada ainda" : atingiuMeta ? "Meta atingida: o sistema pode virar a fonte principal" : `Última semana avaliada: ${formatarData(resumo.ultimaSemanaConcluida)}`}
          tom={resumo.totalRegistradas === 0 ? "neutro" : atingiuMeta ? "sucesso" : "alerta"}
        />
        <Cartao titulo="Abertas" valor={String(resumo.abertas)} detalhe={`${resumo.naoExplicadas} sem causa (não explicadas)`} tom={resumo.naoExplicadas > 0 ? "perigo" : "neutro"} />
        <Cartao titulo={`Semana de ${formatarData(resumo.semanaReferencia)}`} valor={String(resumo.semanaAtual.total)} detalhe={`${resumo.semanaAtual.abertas} abertas · ${resumo.semanaAtual.naoExplicadas} sem causa`} tom="neutro" />
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-zinc-500">Por tipo (total · abertas)</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {TIPOS_DIVERGENCIA.map((t) => (
                <li key={t} className="flex justify-between gap-2">
                  <span>{ROTULO_TIPO_DIVERGENCIA[t]}</span>
                  <span className="font-mono">
                    {resumo.porTipo[t].total} · {resumo.porTipo[t].abertas}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {podeRegistrar ? (
      <Card id="registrar">
        <CardHeader>
          <CardTitle>Registrar divergência</CardTitle>
          <CardDescription>
            {prazoPre ? (
              <>
                Pré-preenchido a partir do prazo{" "}
                <Link href={`/prazos/${prazoPre.id}`} className="underline">
                  {prazoPre.ato_descricao ?? "prazo"} · {prazoPre.processos?.numero_cnj_mascara ?? "—"}
                </Link>
                . Complete com a data vista no PJe.
              </>
            ) : pubPre ? (
              <>
                Pré-preenchido a partir da{" "}
                <Link href={`/publicacoes/${pubPre.id}`} className="underline">
                  publicação
                </Link>
                .
              </>
            ) : (
              "Semana = sexta-feira da conferência. Causa e correção podem ficar para depois, mas enquanto a causa estiver vazia a divergência conta como não explicada."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={registrar} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo label="Semana (sexta-feira)">
              <Input name="semana" type="date" required defaultValue={resumo.semanaReferencia} />
            </Campo>
            <Campo label="Tipo">
              <Select name="tipo" defaultValue={tipoPre}>
                {TIPOS_DIVERGENCIA.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO_DIVERGENCIA[t]}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="O que divergiu" className="sm:col-span-2">
              <Textarea name="descricao" rows={2} required defaultValue={descricaoPre} placeholder="Ex.: sistema calculou 10/11, PJe mostra 11/11" />
            </Campo>
            <Campo label="Causa (opcional agora, obrigatória para a semana contar como limpa)" className="sm:col-span-2">
              <Input name="causa" placeholder="Ex.: feriado da comarca faltando no calendário; classificação errada; publicação sem OAB" />
            </Campo>
            <Campo label="Correção feita (opcional)" className="sm:col-span-2">
              <Input name="correcao" placeholder="Ex.: feriado cadastrado em Configurações → Calendário; prazo prorrogado" />
            </Campo>
            <Campo label="Prazo (id, opcional)">
              <Input name="prazo_id" defaultValue={prazoPre?.id ?? ""} className="font-mono text-xs" />
            </Campo>
            <Campo label="Publicação (id, opcional)">
              <Input name="publicacao_id" defaultValue={pubPre?.id ?? ""} className="font-mono text-xs" />
            </Campo>
            <Campo label="Processo (id, opcional)">
              <Input name="processo_id" defaultValue={processoPre} className="font-mono text-xs" />
            </Campo>
            <div className="flex items-end">
              <Button type="submit">Registrar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Registros</CardTitle>
          <CardDescription>Filtre por semana, tipo e situação. &quot;Resolver&quot; grava a data da resolução e, se preenchidas, a causa e a correção.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form method="get" className="grid gap-2 sm:grid-cols-4">
            <Campo label="Semana">
              <Select name="semana" defaultValue={filtroSemana ?? ""}>
                <option value="">Todas</option>
                {resumo.semanasRegistradas.map((s) => (
                  <option key={s} value={s}>
                    {formatarData(s)}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Tipo">
              <Select name="tipo" defaultValue={filtroTipo ?? ""}>
                <option value="">Todos</option>
                {TIPOS_DIVERGENCIA.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO_DIVERGENCIA[t]}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Situação">
              <Select name="situacao" defaultValue={situacao}>
                <option value="abertas">Abertas</option>
                <option value="resolvidas">Resolvidas</option>
                <option value="todas">Todas</option>
              </Select>
            </Campo>
            <div className="flex items-end gap-2">
              <Button type="submit" variante="secundaria">
                Filtrar
              </Button>
              {filtrosAtivos ? (
                <Link href="/admin/divergencias" className="text-sm text-zinc-500 hover:underline">
                  limpar
                </Link>
              ) : null}
            </div>
          </form>

          {lista.length === 0 ? (
            <Vazio titulo={filtrosAtivos ? "Nenhuma divergência com esses filtros." : "Nenhuma divergência aberta."} descricao={resumo.totalRegistradas === 0 ? "Registre a primeira conferência de sexta-feira, mesmo que não tenha havido divergência (tipo \"Outro\", causa \"conferência sem divergência\"), para a contagem começar." : undefined} />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Semana</TH>
                  <TH>Tipo</TH>
                  <TH>O que divergiu</TH>
                  <TH>Causa</TH>
                  <TH>Correção</TH>
                  <TH>Ligações</TH>
                  <TH>Registro</TH>
                  <TH>Situação</TH>
                </TR>
              </THead>
              <TBody>
                {lista.map((d) => (
                  <TR key={d.id}>
                    <TD className="whitespace-nowrap">{formatarData(d.semana)}</TD>
                    <TD>
                      <Badge tom="contorno">{ROTULO_TIPO_DIVERGENCIA[d.tipo] ?? d.tipo}</Badge>
                    </TD>
                    <TD className="max-w-xs text-xs">{d.descricao}</TD>
                    <TD className="max-w-xs text-xs">{naoExplicada(d) ? <Badge tom="perigo">não explicada</Badge> : d.causa}</TD>
                    <TD className="max-w-xs text-xs">{d.correcao ?? "—"}</TD>
                    <TD className="text-xs">
                      <div className="flex flex-col gap-0.5">
                        {d.prazo_id ? (
                          <Link href={`/prazos/${d.prazo_id}`} className="hover:underline">
                            prazo
                          </Link>
                        ) : null}
                        {d.publicacao_id ? (
                          <Link href={`/publicacoes/${d.publicacao_id}`} className="hover:underline">
                            publicação
                          </Link>
                        ) : null}
                        {d.processo_id ? (
                          <Link href={`/processos/${d.processo_id}`} className="font-mono hover:underline">
                            {d.processos?.numero_cnj_mascara ?? "processo"}
                          </Link>
                        ) : null}
                        {!d.prazo_id && !d.publicacao_id && !d.processo_id ? "—" : null}
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-zinc-500">
                      {formatarDataHora(d.criado_em, timeZone)}
                      <br />
                      {d.registrada_por ? nomes.get(d.registrada_por) ?? "membro" : "—"}
                    </TD>
                    <TD>
                      {d.resolvida_em ? (
                        <span className="text-xs text-zinc-500">resolvida em {formatarDataHora(d.resolvida_em, timeZone)}</span>
                      ) : !podeRegistrar ? (
                        <span className="text-xs text-zinc-500">aberta</span>
                      ) : (
                        <form action={resolver.bind(null, d.id)} className="flex flex-col gap-1">
                          {naoExplicada(d) ? <Input name="causa" placeholder="causa" required className="h-8 text-xs" /> : null}
                          {!d.correcao ? <Input name="correcao" placeholder="correção (opcional)" className="h-8 text-xs" /> : null}
                          <Button type="submit" variante="contorno" tamanho="sm" className="self-start">
                            Resolver
                          </Button>
                        </form>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Cartao({ titulo, valor, detalhe, tom }: { titulo: string; valor: string; detalhe?: string; tom: "neutro" | "sucesso" | "alerta" | "perigo" }) {
  const cor = { neutro: "", sucesso: "text-emerald-700 dark:text-emerald-300", alerta: "text-amber-700 dark:text-amber-300", perigo: "text-red-700 dark:text-red-300" }[tom];
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-zinc-500">{titulo}</p>
        <p className={`text-3xl font-semibold ${cor}`}>{valor}</p>
        {detalhe ? <p className="text-xs text-zinc-500">{detalhe}</p> : null}
      </CardContent>
    </Card>
  );
}
