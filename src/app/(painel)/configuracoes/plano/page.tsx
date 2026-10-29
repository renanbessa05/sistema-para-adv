import { exigirSessao } from "@/server/sessao";
import { agoraServidor } from "@/server/relogio";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Campo, Input } from "@/components/ui/input";
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
        <h1 className="text-xl font-semibold">Plano</h1>
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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Plano e acesso de suporte</h1>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="info">{ok}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Plano</CardTitle>
          <CardDescription>Os planos e seus valores são a confirmar. Sem plano cadastrado, o escritório não tem limites.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p>Plano: {assinatura ? assinatura.plano_codigo : "Sem plano cadastrado (a confirmar)"}</p>
          <p>Limite de usuários: {limites?.limite_usuarios ?? "herdado do plano ou sem limite"}</p>
          <p>Limite de processos: {limites?.limite_processos ?? "herdado do plano ou sem limite"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acesso de suporte</CardTitle>
          <CardDescription>
            A equipe de suporte entra só para leitura, com validade e motivo que você define. Ela não escreve nos dados e você pode revogar a qualquer momento.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={concederAcessoSuporte} className="grid gap-3 sm:grid-cols-2">
            <Campo label="E-mail da conta de suporte">
              <Input name="email" type="email" required />
            </Campo>
            <Campo label="Validade (dias, 1 a 30)">
              <Input name="dias" type="number" min={1} max={30} defaultValue={1} required />
            </Campo>
            <Campo label="Motivo (mínimo 10 caracteres)" className="sm:col-span-2">
              <Input name="motivo" required minLength={10} />
            </Campo>
            <div className="sm:col-span-2">
              <Button type="submit">Conceder acesso</Button>
            </div>
          </form>

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
              {((acessos ?? []) as AcessoSuporte[]).map((a) => {
                const vigente = !a.revogado_em && new Date(a.expira_em).getTime() > agora;
                return (
                  <TR key={a.id}>
                    <TD>{a.motivo}</TD>
                    <TD>{new Date(a.expira_em).toLocaleString("pt-BR", { timeZone: "America/Cuiaba" })}</TD>
                    <TD>{a.revogado_em ? "Revogado" : vigente ? "Vigente" : "Vencido"}</TD>
                    <TD>
                      {vigente ? (
                        <form action={revogarAcessoSuporte}>
                          <input type="hidden" name="id" value={a.id} />
                          <Button type="submit" variante="contorno">
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
        </CardContent>
      </Card>
    </div>
  );
}
