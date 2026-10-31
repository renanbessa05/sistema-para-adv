import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Receipt, Scale } from "lucide-react";
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
import { cn, formatarData } from "@/lib/utils";
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

  const etapaAtual = c.status === "cancelado" ? 0 : ["aprovado", "assinado"].includes(c.status) ? 5 : ["confirmado", "aguardando_aprovacao"].includes(c.status) ? 4 : calc && !calc.bloqueio ? 3 : d ? 2 : 1;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link href="/contratos" className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-500 hover:text-marca-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Contratos
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-[24px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950 sm:text-[26px]">{cliente?.nome as string}</h1>
            <Badge tom={c.status === "assinado" || c.status === "aprovado" ? "sucesso" : c.status === "cancelado" ? "neutro" : "alerta"}>{ROTULO_STATUS_CONTRATO[c.status] ?? c.status}</Badge>
          </div>
          <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-zinc-500">
            <span className="font-semibold text-zinc-700">{c.demanda_em_curso ? "Demanda em curso" : "Caso novo"}</span>
            <span className="capitalize">{c.via}</span>
            <span>
              polo: <span className="font-semibold text-zinc-700">{c.polo ?? "—"}</span>
            </span>
          </p>
        </div>
        {c.status !== "cancelado" && c.status !== "assinado" ? (
          <form action={cancelarContratoAction.bind(null, id)} className="flex flex-wrap gap-2 lg:shrink-0">
            <Input name="motivo" placeholder="Motivo do cancelamento" className="h-9 min-w-0 flex-1 sm:w-56 sm:flex-none" aria-label="Motivo do cancelamento" />
            <Button type="submit" variante="fantasma" className="text-red-700 hover:bg-red-50 hover:text-red-800">
              Cancelar contrato
            </Button>
          </form>
        ) : null}
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      <Trilha etapa={etapaAtual} />

      {/* Etapa 1: diagnóstico */}
      <Card>
        <CardHeader className="flex-row items-start gap-3">
          <Etapa n={1} feita={Boolean(d)} />
          <div className="min-w-0">
            <CardTitle>1. Diagnóstico (IA)</CardTitle>
            <CardDescription className="mt-1">{d ? `Complexidade ${d.complexidade}: ${d.complexidade_justificativa}` : "Ainda sem diagnóstico."}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {d ? (
            <>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                <Dado rotulo="Objeto" valor={d.objeto} className="sm:col-span-2 lg:col-span-3" />
                <Dado rotulo="Demanda" valor={d.tipo_demanda} />
                <Dado rotulo="Natureza" valor={d.natureza} />
                <Dado rotulo="Fase" valor={d.fase} />
                <Dado rotulo="Parte contrária" valor={d.parte_contraria ?? "—"} />
                <Dado rotulo="Proveito estimado" valor={`${d.proveito_estimado !== null ? formatarReais(d.proveito_estimado) : "inestimável"}${d.proveito_observacao ? ` (${d.proveito_observacao})` : ""}`} />
                <Dado rotulo="Tese" valor={d.tese} />
                <Dado rotulo="Trabalho" valor={d.trabalho} />
                <Dado rotulo="Título formado" valor={d.titulo_formado ? "sim" : "não"} />
                {d.fatores_complexidade?.length ? <Dado rotulo="Fatores de complexidade" valor={d.fatores_complexidade.join("; ")} className="sm:col-span-2 lg:col-span-3" /> : null}
              </dl>
              {d.alertas?.length ? <Alert tom="alerta" titulo="Alertas da IA">{d.alertas.join(" · ")}</Alert> : null}
              {d.lacunas?.length ? <Alert tom="info" titulo="Lacunas do relato">{d.lacunas.join(" · ")}</Alert> : null}
            </>
          ) : null}
          <details className="group rounded-xl border border-zinc-200 bg-zinc-50/60 text-xs text-zinc-600">
            <summary className="cursor-pointer px-3.5 py-2.5 font-semibold text-zinc-700 select-none">Relato enviado</summary>
            <p className="border-t border-zinc-200 px-3.5 py-3 leading-relaxed whitespace-pre-wrap">{c.relato}</p>
          </details>
          {["rascunho", "aguardando_confirmacao"].includes(c.status) ? (
            <form action={rediagnosticarAction.bind(null, id)} className="flex border-t border-zinc-100 pt-3">
              <Button type="submit" variante="contorno" tamanho="sm">
                Refazer diagnóstico
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {/* Etapa 2: cálculo */}
      <Card>
        <CardHeader className="flex-row items-start gap-3">
          <Etapa n={2} feita={Boolean(calc && !calc.bloqueio)} />
          <div className="min-w-0">
            <CardTitle>2. Cálculo pela Tabela OAB/MT</CardTitle>
            <CardDescription className="mt-1">{tabela ? `URH R$ ${tabela.valorUrh.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}, vigência ${formatarData(tabela.vigenciaInicio)}` : "Sem tabela cadastrada."}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {calc && !calc.bloqueio ? (
            <>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <pre className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 font-mono text-xs leading-relaxed text-zinc-700">{`Rubricas:      ${calc.rubricas.map((r) => `${r.codigo} (${r.urh} URH)`).join(" + ")}
Piso OAB/MT:   ${calc.piso.urh} URH = ${formatarReais(calc.piso.reais)}
Percentual:    ${calc.percentual ? `${calc.percentual.taxa}% sobre ${formatarReais(calc.percentual.base)} = ${formatarReais(calc.percentual.reais)}` : "não aplicável (proveito desconhecido)"}
Complexidade:  ${c.complexidade} → fator ${calc.fator}`}</pre>
                <div className="flex flex-col justify-center rounded-xl border border-marca-200 bg-gradient-to-br from-marca-50 to-white px-5 py-4 lg:min-w-[14rem]">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-marca-700 uppercase">
                    <Scale className="h-3.5 w-3.5" aria-hidden />
                    Sugerido
                  </p>
                  <p className="mt-1 text-[28px] leading-none font-extrabold tracking-[-0.03em] text-zinc-950 tabular-nums">{formatarReais(calc.sugerido)}</p>
                  <p className="mt-1.5 text-xs text-zinc-500">Piso {formatarReais(calc.piso.reais)} · fator {calc.fator}</p>
                </div>
              </div>
              {calc.alertas.length ? <Alert tom="alerta">{calc.alertas.map((a) => ROTULO_ALERTA[a] ?? a).join(" · ")}</Alert> : null}
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {calc.modalidades.map((m) => {
                  const recomendada = calc.sugestao?.modalidade === m.tipo;
                  return (
                    <div key={m.tipo} className={cn("flex flex-col gap-1 rounded-xl border p-3.5", recomendada ? "border-marca-300 bg-marca-50/60 shadow-xs ring-1 ring-marca-200" : "border-zinc-200 bg-white", m.disponivel ? undefined : "opacity-50")}>
                      <p className="flex flex-wrap items-center justify-between gap-1.5 text-[13px] font-bold text-zinc-950">
                        {m.rotulo} {recomendada ? <Badge tom="sucesso">recomendada</Badge> : null}
                      </p>
                      <p className="font-semibold text-zinc-900 tabular-nums">
                        {m.valorFixo !== null ? formatarReais(m.valorFixo) : ""}
                        {m.percentual !== null ? `${m.valorFixo !== null ? " + " : ""}${m.percentual}% do líquido` : ""}
                        {m.parcelas && m.parcelas > 1 ? ` em ${m.parcelas}× de ${formatarReais(m.valorParcela ?? 0)}` : ""}
                      </p>
                      <p className="text-xs leading-relaxed text-zinc-500">{m.observacao}</p>
                    </div>
                  );
                })}
              </div>
              {calc.sugestao ? (
                <p className="text-xs leading-relaxed text-zinc-600">
                  <span className="font-semibold text-zinc-800">Por que:</span> {calc.sugestao.razao}
                </p>
              ) : null}
            </>
          ) : calc?.bloqueio ? (
            <Alert tom="perigo">{calc.bloqueio === "tabela_vencida" ? ROTULO_ALERTA.tabela_vencida : "Nenhuma rubrica aplicável: ajuste abaixo."}</Alert>
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-4 text-zinc-500">Faça o diagnóstico para calcular.</p>
          )}
          {["rascunho", "aguardando_confirmacao", "confirmado"].includes(c.status) && tabela ? (
            <form action={recalcularAction.bind(null, id)} className="grid gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 p-3.5 sm:grid-cols-4">
              <p className="text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase sm:col-span-4">Ajustar o cálculo</p>
              <Campo label="Rubricas" className="sm:col-span-2" dica="Segure Ctrl (ou Cmd) para escolher mais de uma.">
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
              <Campo label="Parcelas (parcelado)">
                <Input name="parcelas" defaultValue={c.parcelas ?? ""} inputMode="numeric" />
              </Campo>
              <label className="flex cursor-pointer items-center gap-2 self-end rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-700 has-[:checked]:border-marca-300 has-[:checked]:bg-marca-50 sm:col-span-2">
                <input type="checkbox" name="cautelar_satisfativa" defaultChecked={c.cautelar_satisfativa} className="h-4 w-4 rounded border-zinc-300 accent-marca-600" /> Cautelar satisfativa (+50%)
              </label>
              <div className="flex items-end justify-end sm:col-span-2">
                <Button type="submit" variante="secundaria" className="h-10 w-full sm:w-auto">
                  Recalcular
                </Button>
              </div>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {/* Etapa 3: confirmação */}
      {calc && !calc.bloqueio && ["rascunho", "aguardando_confirmacao", "confirmado"].includes(c.status) ? (
        <Card className={podeConfirmar ? "border-marca-200 shadow-md" : undefined}>
          <CardHeader className="flex-row items-start gap-3">
            <Etapa n={3} feita={c.status === "confirmado"} />
            <div className="min-w-0">
              <CardTitle>3. Confirma o valor e a modalidade?</CardTitle>
              <CardDescription className="mt-1">{podeConfirmar ? "Parada obrigatória: só depois da confirmação os documentos são gerados." : "Só advogado ou sócio confirma."}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {podeConfirmar ? (
              <form action={confirmarValorAction.bind(null, id)} className="grid gap-3 sm:grid-cols-3">
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
                <label className="flex cursor-pointer items-center gap-2 self-end rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2.5 text-xs text-zinc-600 has-[:checked]:border-ouro-300 has-[:checked]:bg-ouro-50 sm:col-span-2">
                  <input type="checkbox" name="forcar" className="h-4 w-4 rounded border-zinc-300 accent-ouro-500" /> Confirmar mesmo com alerta de piso ou teto (fica registrado)
                </label>
                <div className="flex items-end justify-end">
                  <Button type="submit" className="w-full sm:w-auto">
                    <Check aria-hidden />
                    Confirmar valor e modalidade
                  </Button>
                </div>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Etapa 4: documentos */}
      {["confirmado", "aguardando_aprovacao", "aprovado", "assinado"].includes(c.status) ? (
        <Card>
          <CardHeader className="flex-row items-start gap-3">
            <Etapa n={4} feita={docsDoContrato.length >= 2} />
            <div className="min-w-0">
              <CardTitle>4. Documentos</CardTitle>
              <CardDescription className="mt-1">
                {c.modalidade ? `${ROTULO_MODALIDADE[c.modalidade]}: ${c.valor_fixo !== null ? formatarReais(Number(c.valor_fixo)) : ""}${c.percentual_exito !== null ? ` ${c.valor_fixo !== null ? "+ " : ""}${Number(c.percentual_exito)}%` : ""}` : ""}. Contatos do cliente no contrato são os do escritório (política antifraude); a declaração não traz contato nenhum.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {pendentes.length ? <Alert tom="alerta" titulo={`${pendentes.length} lacuna(s) nos documentos`}>{pendentes.join(" · ")}</Alert> : null}
            {c.status === "confirmado" || c.status === "aprovado" ? (
              <form action={salvarDadosDocumentosAction.bind(null, id)} className="grid gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 p-3.5 sm:grid-cols-3">
                <p className="text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase sm:col-span-3">Qualificação e poderes</p>
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
                <div className="sm:col-span-3">
                  <p className="mb-1.5 text-[13px] font-semibold text-zinc-700">Poderes específicos</p>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {Object.entries(PODERES_POR_MATERIA).map(([k, v]) => (
                      <label key={k} className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 shadow-xs transition-colors has-[:checked]:border-marca-300 has-[:checked]:bg-marca-50 has-[:checked]:text-marca-800 hover:border-zinc-300">
                        <input type="checkbox" name="poderes" value={k} defaultChecked={c.poderes_especiais.includes(k)} className="h-3.5 w-3.5 rounded border-zinc-300 accent-marca-600" /> {v.rotulo}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="flex cursor-pointer items-center gap-2 self-end rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-700 has-[:checked]:border-marca-300 has-[:checked]:bg-marca-50 sm:col-span-2">
                  <input type="checkbox" name="gratuidade" defaultChecked={c.gratuidade} className="h-4 w-4 rounded border-zinc-300 accent-marca-600" /> Pedir gratuidade da justiça (gera a declaração; pessoa física)
                </label>
                <div className="flex items-end justify-end">
                  <Button type="submit" className="w-full sm:w-auto">
                    {docsDoContrato.length ? "Gerar documentos de novo" : "Gerar documentos"}
                  </Button>
                </div>
              </form>
            ) : null}
            {docsDoContrato.length ? <CartaoDocumentos documentos={docsDoContrato} voltar={`/contratos/${id}`} clienteId={c.cliente_id} papel={sessao.papel} timeZone={timeZone} /> : null}
            {d?.documentos_markdown?.contrato ? (
              <details className="rounded-xl border border-zinc-200 bg-zinc-50/60 text-xs">
                <summary className="cursor-pointer px-3.5 py-2.5 font-semibold text-zinc-700 select-none">Prévia do contrato (texto)</summary>
                <pre className="max-w-none border-t border-zinc-200 px-4 py-3 font-sans leading-relaxed whitespace-pre-wrap text-zinc-700">{d.documentos_markdown.contrato}</pre>
              </details>
            ) : null}
            {c.status === "confirmado" && docsDoContrato.length >= 2 ? (
              <form action={enviarAprovacaoAction.bind(null, id)} className="flex justify-end border-t border-zinc-100 pt-4">
                <Button type="submit" disabled={pendentes.length > 0} className="w-full sm:w-auto">
                  Enviar para aprovação
                </Button>
              </form>
            ) : null}
            {c.status === "aguardando_aprovacao" ? (
              <Alert tom="info">
                Aguardando decisão em{" "}
                <Link href="/aprovacoes" className="font-semibold underline">
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
          <CardHeader className="flex-row items-start gap-3">
            <Etapa n={5} feita={c.status === "assinado"} />
            <div className="min-w-0">
              <CardTitle>5. Assinatura e parcelas</CardTitle>
              <CardDescription className="mt-1">{c.assinado_em ? `Assinado em ${formatarData(c.assinado_em)}.` : "Aprovado. Registre a assinatura para gerar as parcelas."}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {c.status === "aprovado" && podeConfirmar ? (
              <form action={registrarAssinaturaAction.bind(null, id)} className="flex flex-col gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 p-3.5 sm:flex-row sm:items-end">
                <Campo label="Data da assinatura" className="min-w-0 sm:w-56">
                  <Input name="assinado_em" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
                </Campo>
                <Button type="submit" className="h-10 w-full sm:w-auto">
                  Registrar assinatura
                </Button>
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
                      <TD className="font-semibold text-zinc-950 tabular-nums">{p.numero}</TD>
                      <TD className="whitespace-nowrap tabular-nums">{formatarData(p.vencimento)}</TD>
                      <TD className="whitespace-nowrap font-medium tabular-nums">{formatarReais(Number(p.valor))}</TD>
                      <TD>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Badge tom={p.status === "paga" ? "sucesso" : p.status === "atrasada" ? "perigo" : "neutro"}>{p.status}</Badge>
                          {p.paga_em ? <span className="text-xs text-zinc-500 tabular-nums">em {formatarData(p.paga_em)}</span> : null}
                        </span>
                      </TD>
                      <TD>
                        {p.status !== "paga" && sessao.papel !== "estagiario" ? (
                          <form action={marcarParcelaAction.bind(null, id, p.id)} className="flex items-center gap-1.5">
                            <input type="hidden" name="status" value="paga" />
                            <Input name="paga_em" type="date" className="h-8 w-36 text-xs" defaultValue={new Date().toISOString().slice(0, 10)} aria-label="Data do pagamento" />
                            <Button type="submit" variante="contorno" tamanho="sm">
                              <Receipt aria-hidden />
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
              <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-4 text-sm text-zinc-500">Sem parcelas (êxito puro ou ainda não assinado).</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

const ETAPAS = ["Diagnóstico", "Cálculo", "Confirmação", "Documentos", "Assinatura"];

/** Trilha das cinco etapas da entrada do caso; `etapa` é a etapa em curso (0 = cancelado). */
function Trilha({ etapa }: { etapa: number }) {
  return (
    <ol className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:px-0" aria-label="Etapas do contrato">
      {ETAPAS.map((rotulo, i) => {
        const n = i + 1;
        const feita = n < etapa;
        const atual = n === etapa;
        return (
          <li key={rotulo} className={cn("flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap", atual ? "border-marca-300 bg-marca-50 text-marca-800" : feita ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-white text-zinc-400")}>
            <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold tabular-nums", atual ? "bg-marca-600 text-white" : feita ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-500")} aria-hidden>
              {feita ? <Check className="h-3 w-3" /> : n}
            </span>
            {rotulo}
          </li>
        );
      })}
    </ol>
  );
}

/** Número da etapa ao lado do título do cartão: azul em curso, verde quando feita. */
function Etapa({ n, feita }: { n: number; feita: boolean }) {
  return (
    <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold tabular-nums", feita ? "bg-emerald-600 text-white" : "bg-marca-600 text-white shadow-marca")} aria-hidden>
      {feita ? <Check className="h-4 w-4" /> : n}
    </span>
  );
}

/** Par rótulo/valor do diagnóstico. */
function Dado({ rotulo, valor, className }: { rotulo: string; valor: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase">{rotulo}</dt>
      <dd className="mt-0.5 text-sm leading-snug font-medium text-zinc-900">{valor}</dd>
    </div>
  );
}
