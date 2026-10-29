import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarParcelas, obterContrato, ROTULO_STATUS_CONTRATO, tabelaVigente } from "@/server/contratos";
import { listarDocumentos } from "@/server/documentos";
import { formatarReais, ROTULO_MODALIDADE } from "@/lib/honorarios";
import { PODERES_POR_MATERIA } from "@/lib/docx";
import type { DiagnosticoHonorarios } from "@/lib/ia/schemas/honorarios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CartaoDocumentos } from "@/components/dominio/CartaoDocumentos";
import { formatarData } from "@/lib/utils";
import { cancelarContratoAction, confirmarValorAction, enviarAprovacaoAction, marcarParcelaAction, recalcularAction, rediagnosticarAction, registrarAssinaturaAction, salvarDadosDocumentosAction } from "../actions";

export const metadata = { title: "Contrato" };
export const dynamic = "force-dynamic";

const ROTULO_ALERTA: Record<string, string> = {
  tabela_vencida: "Tabela OAB/MT com mais de 12 meses: cadastre a vigente",
  rubrica_desconhecida: "Alguma rubrica sugerida não existe na tabela",
  proveito_desconhecido: "Proveito econômico não apurável: modalidades de êxito indisponíveis",
  acima_30: "Percentual acima de 30%: zona de risco de ação revisional",
  perto_teto_art50: "Perto do teto do art. 50 do CED (contratual + sucumbência ≤ proveito)",
  cautelar_satisfativa: "Cautelar satisfativa: +50% aplicado",
  abaixo_piso: "Valor abaixo do piso da OAB/MT (aviltamento)",
};

export default async function PaginaContrato({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  const { id } = await params;
  const { erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const c = await obterContrato(supabase, id);
  if (!c) notFound();
  const [{ data: cliente }, parcelas, documentos, tabela, { data: esc }] = await Promise.all([
    supabase.from("clientes").select("id, nome, tipo_pessoa").eq("id", c.cliente_id).maybeSingle(),
    listarParcelas(supabase, id),
    listarDocumentos(supabase, { clienteId: c.cliente_id, limite: 50 }).catch(() => []),
    tabelaVigente(supabase, "MT"),
    supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).maybeSingle(),
  ]);
  const timeZone = (esc?.timezone as string | undefined) ?? "America/Cuiaba";
  const d = c.diagnostico as (DiagnosticoHonorarios & { marcadores_pendentes?: string[]; documentos_markdown?: { contrato?: string } }) | null;
  const calc = c.calculo;
  const podeConfirmar = ["socio", "advogado"].includes(sessao.papel);
  const docsDoContrato = documentos.filter((x) => [c.documento_contrato_id, c.documento_procuracao_id, c.documento_declaracao_id].includes(x.id));
  const pendentes = d?.marcadores_pendentes ?? [];
  const q = c.qualificacao ?? {};

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/contratos" className="text-sm text-zinc-500 hover:underline">
            ← Contratos
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {cliente?.nome as string}
            <Badge tom={c.status === "assinado" || c.status === "aprovado" ? "sucesso" : c.status === "cancelado" ? "neutro" : "alerta"}>{ROTULO_STATUS_CONTRATO[c.status] ?? c.status}</Badge>
          </h1>
          <p className="text-sm text-zinc-500">
            {c.demanda_em_curso ? "Demanda em curso" : "Caso novo"} · {c.via} · polo: {c.polo ?? "—"}
          </p>
        </div>
        {c.status !== "cancelado" && c.status !== "assinado" ? (
          <form action={cancelarContratoAction.bind(null, id)} className="flex gap-1">
            <Input name="motivo" placeholder="Motivo do cancelamento" className="w-56" />
            <Button type="submit" variante="fantasma" tamanho="sm">
              Cancelar contrato
            </Button>
          </form>
        ) : null}
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      {/* Etapa 1: diagnóstico */}
      <Card>
        <CardHeader>
          <CardTitle>1. Diagnóstico (IA)</CardTitle>
          <CardDescription>{d ? `Complexidade ${d.complexidade}: ${d.complexidade_justificativa}` : "Ainda sem diagnóstico."}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {d ? (
            <>
              <p>
                <strong>Objeto:</strong> {d.objeto}
              </p>
              <p>
                <strong>Demanda:</strong> {d.tipo_demanda} · <strong>natureza:</strong> {d.natureza} · <strong>fase:</strong> {d.fase} · <strong>parte contrária:</strong> {d.parte_contraria ?? "—"}
              </p>
              <p>
                <strong>Proveito estimado:</strong> {d.proveito_estimado !== null ? formatarReais(d.proveito_estimado) : "inestimável"} {d.proveito_observacao ? `(${d.proveito_observacao})` : ""} · <strong>tese:</strong> {d.tese} · <strong>trabalho:</strong> {d.trabalho} · <strong>título formado:</strong> {d.titulo_formado ? "sim" : "não"}
              </p>
              {d.fatores_complexidade?.length ? <p><strong>Fatores:</strong> {d.fatores_complexidade.join("; ")}</p> : null}
              {d.alertas?.length ? <Alert tom="alerta" titulo="Alertas da IA">{d.alertas.join(" · ")}</Alert> : null}
              {d.lacunas?.length ? <Alert tom="info" titulo="Lacunas do relato">{d.lacunas.join(" · ")}</Alert> : null}
            </>
          ) : null}
          <details className="text-xs text-zinc-500">
            <summary>Relato enviado</summary>
            <p className="whitespace-pre-wrap">{c.relato}</p>
          </details>
          {["rascunho", "aguardando_confirmacao"].includes(c.status) ? (
            <form action={rediagnosticarAction.bind(null, id)}>
              <Button type="submit" variante="contorno" tamanho="sm">
                Refazer diagnóstico
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {/* Etapa 2: cálculo */}
      <Card>
        <CardHeader>
          <CardTitle>2. Cálculo pela Tabela OAB/MT</CardTitle>
          <CardDescription>{tabela ? `URH R$ ${tabela.valorUrh.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}, vigência ${formatarData(tabela.vigenciaInicio)}` : "Sem tabela cadastrada."}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {calc && !calc.bloqueio ? (
            <>
              <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs dark:bg-zinc-800">{`Rubricas:      ${calc.rubricas.map((r) => `${r.codigo} (${r.urh} URH)`).join(" + ")}
Piso OAB/MT:   ${calc.piso.urh} URH = ${formatarReais(calc.piso.reais)}
Percentual:    ${calc.percentual ? `${calc.percentual.taxa}% sobre ${formatarReais(calc.percentual.base)} = ${formatarReais(calc.percentual.reais)}` : "não aplicável (proveito desconhecido)"}
Complexidade:  ${c.complexidade} → fator ${calc.fator}
SUGERIDO:      ${formatarReais(calc.sugerido)}`}</pre>
              {calc.alertas.length ? <Alert tom="alerta">{calc.alertas.map((a) => ROTULO_ALERTA[a] ?? a).join(" · ")}</Alert> : null}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {calc.modalidades.map((m) => (
                  <div key={m.tipo} className={`rounded-md border p-2 ${calc.sugestao?.modalidade === m.tipo ? "border-zinc-900 dark:border-zinc-100" : "border-zinc-200 dark:border-zinc-800"} ${m.disponivel ? "" : "opacity-50"}`}>
                    <p className="font-medium">
                      {m.rotulo} {calc.sugestao?.modalidade === m.tipo ? <Badge tom="sucesso">recomendada</Badge> : null}
                    </p>
                    <p>
                      {m.valorFixo !== null ? formatarReais(m.valorFixo) : ""}
                      {m.percentual !== null ? `${m.valorFixo !== null ? " + " : ""}${m.percentual}% do líquido` : ""}
                      {m.parcelas && m.parcelas > 1 ? ` em ${m.parcelas}× de ${formatarReais(m.valorParcela ?? 0)}` : ""}
                    </p>
                    <p className="text-xs text-zinc-500">{m.observacao}</p>
                  </div>
                ))}
              </div>
              {calc.sugestao ? <p className="text-xs text-zinc-600 dark:text-zinc-300">Por que: {calc.sugestao.razao}</p> : null}
            </>
          ) : calc?.bloqueio ? (
            <Alert tom="perigo">{calc.bloqueio === "tabela_vencida" ? ROTULO_ALERTA.tabela_vencida : "Nenhuma rubrica aplicável: ajuste abaixo."}</Alert>
          ) : (
            <p className="text-zinc-500">Faça o diagnóstico para calcular.</p>
          )}
          {["rascunho", "aguardando_confirmacao", "confirmado"].includes(c.status) && tabela ? (
            <form action={recalcularAction.bind(null, id)} className="grid gap-2 rounded-md border border-dashed border-zinc-300 p-2 sm:grid-cols-4 dark:border-zinc-700">
              <Campo label="Rubricas" className="sm:col-span-2">
                <Select name="rubricas" multiple defaultValue={c.rubricas} className="h-32">
                  {tabela.itens.map((i) => (
                    <option key={i.codigo} value={i.codigo}>
                      {i.secao} · {i.item} ({i.percentual !== null ? `${i.percentual}%, mín. ${i.minimoUrh} URH` : `${i.multiploUrh} URH`})
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Proveito econômico (R$)">
                <Input name="proveito" defaultValue={c.proveito_economico === null ? "" : String(c.proveito_economico)} inputMode="decimal" />
              </Campo>
              <Campo label="Complexidade">
                <Select name="complexidade" defaultValue={c.complexidade ?? "media"}>
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                </Select>
              </Campo>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="cautelar_satisfativa" defaultChecked={c.cautelar_satisfativa} /> Cautelar satisfativa (+50%)
              </label>
              <Campo label="Parcelas (parcelado)">
                <Input name="parcelas" defaultValue={c.parcelas ?? ""} inputMode="numeric" />
              </Campo>
              <div className="flex items-end">
                <Button type="submit" variante="secundaria" tamanho="sm">
                  Recalcular
                </Button>
              </div>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {/* Etapa 3: confirmação */}
      {calc && !calc.bloqueio && ["rascunho", "aguardando_confirmacao", "confirmado"].includes(c.status) ? (
        <Card>
          <CardHeader>
            <CardTitle>3. Confirma o valor e a modalidade?</CardTitle>
            <CardDescription>{podeConfirmar ? "Parada obrigatória: só depois da confirmação os documentos são gerados." : "Só advogado ou sócio confirma."}</CardDescription>
          </CardHeader>
          <CardContent>
            {podeConfirmar ? (
              <form action={confirmarValorAction.bind(null, id)} className="grid gap-2 sm:grid-cols-3">
                <Campo label="Modalidade">
                  <Select name="modalidade" defaultValue={c.modalidade ?? calc.sugestao?.modalidade ?? "fixo"}>
                    {calc.modalidades.map((m) => (
                      <option key={m.tipo} value={m.tipo} disabled={!m.disponivel}>
                        {m.rotulo}
                      </option>
                    ))}
                  </Select>
                </Campo>
                <Campo label="Valor fixo / entrada (R$)">
                  <Input name="valor_fixo" defaultValue={c.valor_fixo !== null ? String(c.valor_fixo) : String(calc.sugerido)} inputMode="decimal" />
                </Campo>
                <Campo label="Percentual de êxito (%)">
                  <Input name="percentual" defaultValue={c.percentual_exito !== null ? String(c.percentual_exito) : String(calc.modalidades.find((m) => m.tipo === "exito")?.percentual ?? "")} inputMode="decimal" />
                </Campo>
                <Campo label="Parcelas">
                  <Input name="parcelas" defaultValue={c.parcelas ?? calc.modalidades.find((m) => m.tipo === "fixo_parcelado")?.parcelas ?? 1} inputMode="numeric" />
                </Campo>
                <Campo label="Primeira parcela em">
                  <Input name="primeira_parcela_em" type="date" defaultValue={c.primeira_parcela_em ?? ""} />
                </Campo>
                <Campo label="Dia de vencimento (1 a 28)">
                  <Input name="dia_vencimento" defaultValue={c.dia_vencimento ?? ""} inputMode="numeric" />
                </Campo>
                <label className="flex items-center gap-2 text-xs text-zinc-500 sm:col-span-2">
                  <input type="checkbox" name="forcar" /> Confirmar mesmo com alerta de piso ou teto (fica registrado)
                </label>
                <div className="flex justify-end">
                  <Button type="submit">Confirmar valor e modalidade</Button>
                </div>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Etapa 4: documentos */}
      {["confirmado", "aguardando_aprovacao", "aprovado", "assinado"].includes(c.status) ? (
        <Card>
          <CardHeader>
            <CardTitle>4. Documentos</CardTitle>
            <CardDescription>
              {c.modalidade ? `${ROTULO_MODALIDADE[c.modalidade]}: ${c.valor_fixo !== null ? formatarReais(Number(c.valor_fixo)) : ""}${c.percentual_exito !== null ? ` ${c.valor_fixo !== null ? "+ " : ""}${Number(c.percentual_exito)}%` : ""}` : ""}. Contatos do cliente no contrato são os do escritório (política antifraude); a declaração não traz contato nenhum.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {pendentes.length ? <Alert tom="alerta" titulo={`${pendentes.length} lacuna(s) nos documentos`}>{pendentes.join(" · ")}</Alert> : null}
            {c.status === "confirmado" || c.status === "aprovado" ? (
              <form action={salvarDadosDocumentosAction.bind(null, id)} className="grid gap-2 sm:grid-cols-3">
                {cliente?.tipo_pessoa === "juridica" ? (
                  <>
                    <Campo label="Representante legal"><Input name="representante" defaultValue={q.representante ?? ""} /></Campo>
                    <Campo label="Qualificação do representante"><Input name="representante_qualificacao" defaultValue={q.representanteQualificacao ?? ""} placeholder="brasileiro, casado, empresário, CPF…" /></Campo>
                    <Campo label="Instrumento"><Input name="instrumento_representacao" defaultValue={q.instrumentoRepresentacao ?? "contrato social"} /></Campo>
                  </>
                ) : (
                  <>
                    <Campo label="Nacionalidade"><Input name="nacionalidade" defaultValue={q.nacionalidade ?? "brasileiro(a)"} /></Campo>
                    <Campo label="Estado civil"><Input name="estado_civil" defaultValue={q.estadoCivil ?? ""} /></Campo>
                    <Campo label="Profissão"><Input name="profissao" defaultValue={q.profissao ?? ""} /></Campo>
                  </>
                )}
                <Campo label="Parte contrária"><Input name="parte_contraria" defaultValue={c.parte_contraria ?? ""} /></Campo>
                <Campo label="Juízo"><Input name="juizo" defaultValue={c.juizo ?? ""} placeholder="1ª Vara Cível da Comarca de Cuiabá" /></Campo>
                <Campo label="Foro de eleição (comarca do cliente)"><Input name="foro_comarca" defaultValue={c.foro_comarca ?? ""} /></Campo>
                <Campo label="Órgãos do caso (procuração)"><Input name="orgaos_do_caso" defaultValue={q.orgaos_do_caso ?? ""} placeholder="INSS, PGE/MT, SEDUC…" /></Campo>
                <Campo label="Contatos do outorgante na procuração">
                  <Select name="contatos_procuracao" defaultValue={c.contatos_procuracao}>
                    <option value="escritorio">Do escritório</option>
                    <option value="nenhum">Nenhum</option>
                    <option value="cliente">Do cliente</option>
                  </Select>
                </Campo>
                <Campo label="Fato essencial declarado (opcional)"><Input name="fato_essencial" defaultValue={q.fato_essencial ?? ""} /></Campo>
                <Campo label="Poderes específicos" className="sm:col-span-3">
                  <div className="flex flex-wrap gap-3 text-sm">
                    {Object.entries(PODERES_POR_MATERIA).map(([k, v]) => (
                      <label key={k} className="flex items-center gap-1">
                        <input type="checkbox" name="poderes" value={k} defaultChecked={c.poderes_especiais.includes(k)} /> {v.rotulo}
                      </label>
                    ))}
                  </div>
                </Campo>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" name="gratuidade" defaultChecked={c.gratuidade} /> Pedir gratuidade da justiça (gera a declaração; pessoa física)
                </label>
                <div className="flex justify-end">
                  <Button type="submit">{docsDoContrato.length ? "Gerar documentos de novo" : "Gerar documentos"}</Button>
                </div>
              </form>
            ) : null}
            {docsDoContrato.length ? <CartaoDocumentos documentos={docsDoContrato} voltar={`/contratos/${id}`} clienteId={c.cliente_id} papel={sessao.papel} timeZone={timeZone} /> : null}
            {d?.documentos_markdown?.contrato ? (
              <details className="text-xs">
                <summary className="cursor-pointer text-zinc-500">Prévia do contrato (texto)</summary>
                <pre className="whitespace-pre-wrap rounded-md bg-zinc-100 p-3 dark:bg-zinc-800">{d.documentos_markdown.contrato}</pre>
              </details>
            ) : null}
            {c.status === "confirmado" && docsDoContrato.length >= 2 ? (
              <form action={enviarAprovacaoAction.bind(null, id)} className="flex justify-end">
                <Button type="submit" disabled={pendentes.length > 0}>
                  Enviar para aprovação
                </Button>
              </form>
            ) : null}
            {c.status === "aguardando_aprovacao" ? (
              <Alert tom="info">
                Aguardando decisão em{" "}
                <Link href="/aprovacoes" className="underline">
                  Aprovações
                </Link>
                .
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Etapa 5: assinatura e parcelas */}
      {["aprovado", "assinado"].includes(c.status) ? (
        <Card>
          <CardHeader>
            <CardTitle>5. Assinatura e parcelas</CardTitle>
            <CardDescription>{c.assinado_em ? `Assinado em ${formatarData(c.assinado_em)}.` : "Aprovado. Registre a assinatura para gerar as parcelas."}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {c.status === "aprovado" && podeConfirmar ? (
              <form action={registrarAssinaturaAction.bind(null, id)} className="flex items-end gap-2">
                <Campo label="Data da assinatura">
                  <Input name="assinado_em" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
                </Campo>
                <Button type="submit">Registrar assinatura</Button>
              </form>
            ) : null}
            {parcelas.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>#</TH>
                    <TH>Vencimento</TH>
                    <TH>Valor</TH>
                    <TH>Status</TH>
                    <TH>Ações</TH>
                  </TR>
                </THead>
                <TBody>
                  {parcelas.map((p) => (
                    <TR key={p.id}>
                      <TD>{p.numero}</TD>
                      <TD>{formatarData(p.vencimento)}</TD>
                      <TD>{formatarReais(Number(p.valor))}</TD>
                      <TD>
                        <Badge tom={p.status === "paga" ? "sucesso" : p.status === "atrasada" ? "perigo" : "neutro"}>{p.status}</Badge>
                        {p.paga_em ? <span className="ml-1 text-xs text-zinc-500">em {formatarData(p.paga_em)}</span> : null}
                      </TD>
                      <TD>
                        {p.status !== "paga" && sessao.papel !== "estagiario" ? (
                          <form action={marcarParcelaAction.bind(null, id, p.id)} className="flex items-center gap-1">
                            <input type="hidden" name="status" value="paga" />
                            <Input name="paga_em" type="date" className="w-36" defaultValue={new Date().toISOString().slice(0, 10)} />
                            <Button type="submit" variante="contorno" tamanho="sm">
                              Marcar paga
                            </Button>
                          </form>
                        ) : null}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <p className="text-sm text-zinc-500">Sem parcelas (êxito puro ou ainda não assinado).</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
