import { exigirSessao } from "@/server/sessao";
import { agoraServidor } from "@/server/relogio";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Alert, Vazio } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Campo, GrupoCampos, Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { concederAcessoSuporte, revogarAcessoSuporte } from "./actions";

export const metadata = { title: "Plano e acesso de suporte" };
export const dynamic = "force-dynamic";

interface AcessoSuporte {
  id: string;
  motivo: string;
  expira_em: string;
  revogado_em: string | null;
  criado_em: string;
}

export default async function PaginaPlano({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  const { erro, ok } = await searchParams;
  if (sessao.papel !== "socio") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Plano</h1>
            <p className="text-sm text-zinc-500">Plano contratado e acessos de suporte do escritório.</p>
          </div>
        </div>
        <Alert tom="info">Plano e acessos de suporte são do sócio.</Alert>
      </div>
    );
  }

  const supabase = await criarClienteServidor();
  const [{ data: assinaturas }, { data: limites }, { data: acessos }] = await Promise.all([
    supabase.from("assinaturas").select("plano_codigo, status, inicio, fim").eq("escritorio_id", sessao.escritorioId).eq("status", "ativa"),
    supabase.from("escritorio_limites").select("limite_usuarios, limite_processos").eq("escritorio_id", sessao.escritorioId).maybeSingle(),
    supabase
      .from("acessos_suporte")
      .select("id, motivo, expira_em, revogado_em, criado_em")
      .eq("escritorio_id", sessao.escritorioId)
      .order("criado_em", { ascending: false })
      .limit(20),
  ]);
  const assinatura = (assinaturas ?? [])[0] as { plano_codigo: string } | undefined;
  const agora = (await agoraServidor()).getTime();
  const listaAcessos = (acessos ?? []) as AcessoSuporte[];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Plano e acesso de suporte</h1>
          <p className="text-sm text-zinc-500">Plano contratado, limites do escritório e acessos temporários concedidos ao suporte.</p>
        </div>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="info">{ok}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Plano</CardTitle>
          <CardDescription>Os planos e seus valores são a confirmar. Sem plano cadastrado, o escritório não tem limites.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3">
              <dt className="text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase">Plano</dt>
              <dd className="mt-1 font-semibold text-zinc-950">{assinatura ? assinatura.plano_codigo : "Sem plano cadastrado (a confirmar)"}</dd>
            </div>
            <div className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3">
              <dt className="text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase">Limite de usuários</dt>
              <dd className="mt-1 font-semibold text-zinc-950 tabular-nums">{limites?.limite_usuarios ?? "herdado do plano ou sem limite"}</dd>
            </div>
            <div className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3">
              <dt className="text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase">Limite de processos</dt>
              <dd className="mt-1 font-semibold text-zinc-950 tabular-nums">{limites?.limite_processos ?? "herdado do plano ou sem limite"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acesso de suporte</CardTitle>
          <CardDescription>
            A equipe de suporte entra só para leitura, com validade e motivo que você define. Ela não escreve nos dados e você pode revogar a qualquer momento.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <form action={concederAcessoSuporte} className="flex flex-col gap-4">
            <GrupoCampos titulo="Conceder acesso" colunas={2}>
              <Campo label="E-mail da conta de suporte">
                <Input name="email" type="email" required />
              </Campo>
              <Campo label="Validade (dias, 1 a 30)" dica="O acesso expira sozinho ao fim do período.">
                <Input name="dias" type="number" min={1} max={30} defaultValue={1} required />
              </Campo>
              <Campo label="Motivo (mínimo 10 caracteres)" className="sm:col-span-2">
                <Input name="motivo" required minLength={10} />
              </Campo>
            </GrupoCampos>
            <div className="flex justify-end">
              <Button type="submit">Conceder acesso</Button>
            </div>
          </form>

          {listaAcessos.length === 0 ? (
            <Vazio titulo="Nenhum acesso de suporte concedido" descricao="Os acessos concedidos aparecem aqui com validade e situação." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Motivo</TH>
                  <TH>Válido até</TH>
                  <TH>Situação</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {listaAcessos.map((a) => {
                  const vigente = !a.revogado_em && new Date(a.expira_em).getTime() > agora;
                  return (
                    <TR key={a.id}>
                      <TD className="min-w-48 font-semibold text-zinc-950">{a.motivo}</TD>
                      <TD className="whitespace-nowrap text-zinc-600 tabular-nums">{new Date(a.expira_em).toLocaleString("pt-BR", { timeZone: "America/Cuiaba" })}</TD>
                      <TD>{a.revogado_em ? <Badge tom="neutro">Revogado</Badge> : vigente ? <Badge tom="sucesso">Vigente</Badge> : <Badge tom="neutro">Vencido</Badge>}</TD>
                      <TD className="text-right">
                        {vigente ? (
                          <form action={revogarAcessoSuporte}>
                            <input type="hidden" name="id" value={a.id} />
                            <Button type="submit" variante="contorno" tamanho="sm">
                              Revogar
                            </Button>
                          </form>
                        ) : null}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
