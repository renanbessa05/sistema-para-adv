import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { exigirMfaSeNecessario } from "@/server/mfa";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarData, formatarDataHora } from "@/lib/utils";
import { TIPOS_DADO } from "@/lib/lgpd/retencao";
import { TIPOS_SOLICITACAO, rotuloSolicitacao } from "@/lib/lgpd/solicitacoes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Campo, GrupoCampos, Input, Select, Textarea } from "@/components/ui/input";
import { Alert, Vazio } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { NavegacaoConfiguracoes } from "../navegacao";
import { anonimizarTitularAcao, configurarRetencao, registrarPedidoTitular, responderPedidoTitular } from "./actions";

export const metadata = { title: "LGPD" };
export const dynamic = "force-dynamic";

const TOM_SITUACAO: Record<string, "alerta" | "sucesso" | "neutro"> = { aberta: "alerta", respondida: "sucesso", indeferida: "neutro" };

/** Só sócio, com segundo fator. Inventário, pedidos dos titulares, exportação, anonimização e retenção. */
export default async function PaginaLgpd({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") redirect("/configuracoes");
  await exigirMfaSeNecessario(sessao);
  const { erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const [operacoes, solicitacoes, politicas, clientes, auditoria] = await Promise.all([
    supabase.from("operacoes_tratamento").select("id, nome, dados, titulares, base_legal, origem, compartilhamento, retencao").order("nome"),
    supabase.from("lgpd_solicitacoes").select("id, titular_nome, tipo, recebida_em, prazo, status, resposta, respondida_em").order("recebida_em", { ascending: false }).limit(50),
    supabase.from("politicas_retencao").select("tipo_dado, prazo_meses, ativo, confirmado_em"),
    supabase.from("clientes").select("id, nome").eq("ativo", true).order("nome").limit(500),
    supabase.from("lgpd_auditoria").select("acao, alvo_tipo, detalhes, criado_em").order("criado_em", { ascending: false }).limit(20),
  ]);
  const politicaDe = (tipo: string) => politicas.data?.find((p) => p.tipo_dado === tipo);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Configurações</h1>
          <p className="text-sm text-zinc-500">LGPD: pedidos dos titulares, exportação, anonimização, retenção e inventário de tratamento.</p>
        </div>
      </div>
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes/lgpd" />
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Pedidos dos titulares</CardTitle>
          <CardDescription>
            Registre cada pedido recebido. O prazo de resposta é o que a advogada confirmar (a confirmar); o sistema não fixa prazo legal.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <form action={registrarPedidoTitular} className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
            <GrupoCampos titulo="Novo pedido" colunas={2}>
              <Campo label="Titular cadastrado">
                <Select name="cliente_id" aria-label="Titular cadastrado">
                  <option value="">Titular não cadastrado</option>
                  {clientes.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Nome do titular" dica="Preencha quando o titular não estiver no cadastro de clientes.">
                <Input name="titular_nome" placeholder="Nome do titular" aria-label="Nome do titular" />
              </Campo>
              <Campo label="Tipo do pedido">
                <Select name="tipo" aria-label="Tipo do pedido" defaultValue="acesso">
                  {TIPOS_SOLICITACAO.map((t) => (
                    <option key={t.tipo} value={t.tipo}>
                      {t.rotulo}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Prazo de resposta (a confirmar)">
                <Input type="date" name="prazo" aria-label="Prazo de resposta (a confirmar)" required />
              </Campo>
            </GrupoCampos>
            <div className="flex justify-end">
              <Button type="submit">Registrar pedido</Button>
            </div>
          </form>

          {solicitacoes.data?.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Recebido em</TH>
                  <TH>Titular</TH>
                  <TH>Pedido</TH>
                  <TH>Prazo</TH>
                  <TH>Situação</TH>
                  <TH>Resposta</TH>
                </TR>
              </THead>
              <TBody>
                {solicitacoes.data.map((s) => (
                  <TR key={s.id}>
                    <TD className="whitespace-nowrap text-zinc-600 tabular-nums">{formatarData(s.recebida_em)}</TD>
                    <TD className="min-w-36 font-semibold text-zinc-950">{s.titular_nome}</TD>
                    <TD>{rotuloSolicitacao(s.tipo)}</TD>
                    <TD className="whitespace-nowrap tabular-nums">{formatarData(s.prazo)}</TD>
                    <TD>
                      <Badge tom={TOM_SITUACAO[s.status] ?? "neutro"}>{s.status}</Badge>
                    </TD>
                    <TD className="min-w-64">
                      {s.status === "aberta" ? (
                        <form action={responderPedidoTitular} className="flex flex-col gap-2 py-1">
                          <input type="hidden" name="id" value={s.id} />
                          <Textarea name="resposta" required minLength={5} rows={2} className="min-h-0" aria-label="Resposta enviada ao titular" />
                          <div className="flex flex-wrap items-center gap-2">
                            <Select name="status" className="h-8 w-auto min-w-44 text-xs" aria-label="Desfecho">
                              <option value="respondida">Atendido</option>
                              <option value="indeferida">Indeferido (com motivo)</option>
                            </Select>
                            <Button type="submit" tamanho="sm">
                              Registrar resposta
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <span className="text-sm">
                          {s.resposta} <span className="text-xs text-zinc-500 tabular-nums">({formatarDataHora(s.respondida_em)})</span>
                        </span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <Vazio titulo="Nenhum pedido registrado." descricao="Quando um titular pedir acesso, correção ou exclusão de dados, registre aqui para acompanhar o prazo." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exportar dados de um titular</CardTitle>
          <CardDescription>
            Gera um ZIP com cadastro, processos e metadados dos documentos do titular. O link dura 5 minutos e a ação fica registrada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/api/lgpd/exportar" method="get" className="flex flex-wrap items-end gap-3">
            <Campo label="Titular a exportar" className="w-full sm:max-w-sm sm:flex-1">
              <Select name="cliente" aria-label="Titular a exportar" required>
                <option value="">Escolha o titular</option>
                {clientes.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </Campo>
            <Button type="submit" className="h-10">
              Gerar ZIP
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-red-200 bg-gradient-to-b from-red-50/60 to-white to-[96px] dark:border-red-900">
        <CardHeader>
          <CardTitle className="text-red-800">Anonimizar titular (irreversível)</CardTitle>
          <CardDescription>
            Apaga nome, CPF/CNPJ, contatos e endereço do cadastro e das partes dos processos, e desativa o cadastro. O processo e os registros de aprovação permanecem (retenção legal). Documentos anexados não são alterados aqui: a contagem aparece no aviso após a ação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={anonimizarTitularAcao} className="flex flex-col gap-4">
            <GrupoCampos colunas={2}>
              <Campo label="Titular a anonimizar">
                <Select name="cliente_id" aria-label="Titular a anonimizar" required>
                  <option value="">Escolha o titular</option>
                  {clientes.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Confirme o nome do titular" dica="Digite exatamente como está no cadastro.">
                <Input name="confirmacao_nome" placeholder="Digite o nome completo do titular" aria-label="Confirme o nome do titular" required />
              </Campo>
              <label className="flex items-center gap-2.5 text-sm font-medium text-red-900 sm:col-span-2">
                <input type="checkbox" name="ciencia" value="1" required className="h-4 w-4 rounded border-red-300 accent-red-600" /> Entendo que não há desfazer.
              </label>
            </GrupoCampos>
            <div className="flex justify-end">
              <Button type="submit" variante="perigo">
                Anonimizar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retenção e descarte</CardTitle>
          <CardDescription>
            Nada é apagado enquanto a política estiver desligada. Ativar exige prazo e a frase ATIVAR DESCARTE; o job roda domingo, 01h (Cuiabá), e só apaga mensagens do WhatsApp e eventos de webhook já processados. Os demais tipos apenas são contados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Tipo de dado</TH>
                <TH>Situação</TH>
                <TH>Ajustar</TH>
              </TR>
            </THead>
            <TBody>
              {TIPOS_DADO.map((t) => {
                const p = politicaDe(t.tipo);
                return (
                  <TR key={t.tipo}>
                    <TD className="min-w-40 font-semibold text-zinc-950">
                      {t.rotulo}
                      <div className="text-xs font-normal text-zinc-500 tabular-nums">{p?.prazo_meses ? `prazo: ${p.prazo_meses} meses` : "sem descarte automático"}</div>
                    </TD>
                    <TD className="whitespace-nowrap">{p?.ativo ? <Badge tom="sucesso">ativo (confirmado em {formatarDataHora(p.confirmado_em)})</Badge> : <Badge tom="neutro">desligado</Badge>}</TD>
                    <TD>
                      <form action={configurarRetencao} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="tipo_dado" value={t.tipo} />
                        <Input name="prazo_meses" type="number" min={1} max={600} placeholder="meses" aria-label={`Prazo em meses para ${t.rotulo}`} className="h-8 w-24 text-xs" />
                        <label className="flex items-center gap-1.5 text-xs text-zinc-700">
                          <input type="checkbox" name="ativar" value="1" className="h-3.5 w-3.5 rounded border-zinc-300 accent-marca-600" /> ativar
                        </label>
                        <Input name="confirmacao" placeholder="ATIVAR DESCARTE" aria-label={`Confirmação para ${t.rotulo}`} className="h-8 w-40 text-xs" />
                        <Button type="submit" variante="secundaria" tamanho="sm">
                          Salvar
                        </Button>
                      </form>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inventário de operações de tratamento</CardTitle>
          <CardDescription>Registro do art. 37 da LGPD. Fonte: docs/lgpd/registro-operacoes.md. Encarregado: a confirmar.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Operação</TH>
                <TH>Dados</TH>
                <TH>Base legal</TH>
                <TH>Compartilhamento</TH>
                <TH>Retenção</TH>
              </TR>
            </THead>
            <TBody>
              {operacoes.data?.map((o) => (
                <TR key={o.id}>
                  <TD className="min-w-40 font-semibold text-zinc-950">{o.nome}</TD>
                  <TD className="text-zinc-600">{o.dados}</TD>
                  <TD className="text-zinc-600">{o.base_legal}</TD>
                  <TD className="text-zinc-600">{o.compartilhamento}</TD>
                  <TD className="text-zinc-600">{o.retencao}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registro de ações da LGPD</CardTitle>
        </CardHeader>
        <CardContent>
          {auditoria.data?.length ? (
            <ul className="divide-y divide-zinc-100 text-sm">
              {auditoria.data.map((a, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2 py-2">
                  <span className="text-xs text-zinc-500 tabular-nums">{formatarDataHora(a.criado_em)}:</span>
                  <span className="min-w-0 font-medium text-zinc-900">
                    {a.acao} <span className="font-normal text-zinc-500">({a.alvo_tipo})</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Vazio titulo="Nenhuma ação registrada." descricao="Exportações, anonimizações e mudanças de retenção ficam registradas aqui." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
