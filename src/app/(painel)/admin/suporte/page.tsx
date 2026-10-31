import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { agoraServidor } from "@/server/relogio";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Alert, Vazio } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Suporte" };
export const dynamic = "force-dynamic";

/** Visão da equipe de suporte: os acessos que recebeu e o estado de cada um. Somente leitura. */
export default async function PaginaSuporte() {
  const sessao = await exigirSessao();
  if (sessao.papel !== "suporte") redirect("/hoje");
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("acessos_suporte")
    .select("escritorio_id, motivo, expira_em, revogado_em")
    .eq("usuario_id", sessao.usuarioId)
    .order("criado_em", { ascending: false })
    .limit(50);
  const nomes = new Map(sessao.vinculos.map((v) => [v.escritorioId, v.nome]));
  const agora = (await agoraServidor()).getTime();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Acessos de suporte</h1>
          <p className="mt-1 text-sm text-zinc-500">Os escritórios que abriram acesso para você e até quando cada um vale.</p>
        </div>
      </div>
      <Alert tom="info">Você está em modo de leitura. Não há ações de escrita para o suporte; o acesso vale só até a validade indicada pelo escritório.</Alert>
      <Card>
        <CardHeader>
          <CardTitle>Seus acessos</CardTitle>
          <CardDescription>Escritórios que concederam acesso à sua conta.</CardDescription>
        </CardHeader>
        <CardContent>
          {(data ?? []).length === 0 ? (
            <Vazio titulo="Nenhum acesso concedido à sua conta." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Escritório</TH>
                  <TH>Motivo</TH>
                  <TH>Válido até</TH>
                  <TH>Situação</TH>
                </TR>
              </THead>
              <TBody>
                {(data ?? []).map((a, i) => {
                  const vigente = !a.revogado_em && new Date(a.expira_em).getTime() > agora;
                  return (
                    <TR key={i}>
                      <TD className="font-semibold text-zinc-950">{nomes.get(a.escritorio_id) ?? "Escritório"}</TD>
                      <TD className="max-w-md text-zinc-700">{a.motivo}</TD>
                      <TD className="whitespace-nowrap tabular-nums">{new Date(a.expira_em).toLocaleString("pt-BR", { timeZone: "America/Cuiaba" })}</TD>
                      <TD>{a.revogado_em ? <Badge tom="neutro">Revogado</Badge> : vigente ? <Badge tom="sucesso">Vigente</Badge> : <Badge tom="perigo">Vencido</Badge>}</TD>
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
