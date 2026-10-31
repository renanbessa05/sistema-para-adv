import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { exigirMfaSeNecessario } from "@/server/mfa";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarData, formatarDataHora } from "@/lib/utils";
import { TIPOS_DADO } from "@/lib/lgpd/retencao";
import { TIPOS_SOLICITACAO, rotuloSolicitacao } from "@/lib/lgpd/solicitacoes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { NavegacaoConfiguracoes } from "../navegacao";
import { anonimizarTitularAcao, configurarRetencao, registrarPedidoTitular, responderPedidoTitular } from "./actions";

export const metadata = { title: "LGPD" };
export const dynamic = "force-dynamic";

const CAMPO = "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

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
      <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Configurações</h1>
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
        <CardContent className="flex flex-col gap-4">
          <form action={registrarPedidoTitular} className="grid gap-2 md:grid-cols-5">
            <select name="cliente_id" className={CAMPO} aria-label="Titular cadastrado">
              <option value="">Titular não cadastrado</option>
              {clientes.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            <Input name="titular_nome" placeholder="Nome do titular" aria-label="Nome do titular" />
            <select name="tipo" className={CAMPO} aria-label="Tipo do pedido" defaultValue="acesso">
              {TIPOS_SOLICITACAO.map((t) => (
                <option key={t.tipo} value={t.tipo}>{t.rotulo}</option>
              ))}
            </select>
            <Input type="date" name="prazo" aria-label="Prazo de resposta (a confirmar)" required />
            <Button type="submit">Registrar pedido</Button>
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
                    <TD>{formatarData(s.recebida_em)}</TD>
                    <TD>{s.titular_nome}</TD>
                    <TD>{rotuloSolicitacao(s.tipo)}</TD>
                    <TD>{formatarData(s.prazo)}</TD>
                    <TD>{s.status}</TD>
                    <TD>
                      {s.status === "aberta" ? (
                        <form action={responderPedidoTitular} className="flex flex-col gap-1">
                          <input type="hidden" name="id" value={s.id} />
                          <textarea name="resposta" required minLength={5} rows={2} className={CAMPO} aria-label="Resposta enviada ao titular" />
                          <select name="status" className={CAMPO} aria-label="Desfecho">
                            <option value="respondida">Atendido</option>
                            <option value="indeferida">Indeferido (com motivo)</option>
                          </select>
                          <Button type="submit">Registrar resposta</Button>
                        </form>
                      ) : (
                        <span className="text-sm">{s.resposta} <span className="text-zinc-500">({formatarDataHora(s.respondida_em)})</span></span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="text-sm text-zinc-500">Nenhum pedido registrado.</p>
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
          <form action="/api/lgpd/exportar" method="get" className="flex flex-wrap gap-2">
            <select name="cliente" className={CAMPO} aria-label="Titular a exportar" required>
              <option value="">Escolha o titular</option>
              {clientes.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            <Button type="submit">Gerar ZIP</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-red-300 dark:border-red-900">
        <CardHeader>
          <CardTitle>Anonimizar titular (irreversível)</CardTitle>
          <CardDescription>
            Apaga nome, CPF/CNPJ, contatos e endereço do cadastro e das partes dos processos, e desativa o cadastro. O processo e os registros de aprovação permanecem (retenção legal). Documentos anexados não são alterados aqui: a contagem aparece no aviso após a ação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={anonimizarTitularAcao} className="grid gap-2 md:grid-cols-3">
            <select name="cliente_id" className={CAMPO} aria-label="Titular a anonimizar" required>
              <option value="">Escolha o titular</option>
              {clientes.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            <Input name="confirmacao_nome" placeholder="Digite o nome completo do titular" aria-label="Confirme o nome do titular" required />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="ciencia" value="1" required /> Entendo que não há desfazer.
            </label>
            <div className="md:col-span-3">
              <Button type="submit" variante="perigo">Anonimizar</Button>
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
                    <TD>
                      {t.rotulo}
                      <div className="text-xs text-zinc-500">{p?.prazo_meses ? `prazo: ${p.prazo_meses} meses` : "sem descarte automático"}</div>
                    </TD>
                    <TD>{p?.ativo ? `ativo (confirmado em ${formatarDataHora(p.confirmado_em)})` : "desligado"}</TD>
                    <TD>
                      <form action={configurarRetencao} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="tipo_dado" value={t.tipo} />
                        <Input name="prazo_meses" type="number" min={1} max={600} placeholder="meses" aria-label={`Prazo em meses para ${t.rotulo}`} className="w-24" />
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" name="ativar" value="1" /> ativar
                        </label>
                        <Input name="confirmacao" placeholder="ATIVAR DESCARTE" aria-label={`Confirmação para ${t.rotulo}`} className="w-40" />
                        <Button type="submit" variante="secundaria">Salvar</Button>
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
                  <TD>{o.nome}</TD>
                  <TD>{o.dados}</TD>
                  <TD>{o.base_legal}</TD>
                  <TD>{o.compartilhamento}</TD>
                  <TD>{o.retencao}</TD>
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
            <ul className="flex flex-col gap-1 text-sm">
              {auditoria.data.map((a, i) => (
                <li key={i}>
                  {formatarDataHora(a.criado_em)}: {a.acao} ({a.alvo_tipo})
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">Nenhuma ação registrada.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
