import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { exigeMfa, listarFatores } from "@/server/mfa";
import { formatarDataHora } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Vazio } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { NavegacaoConfiguracoes } from "../navegacao";
import { BotaoRemoverFator } from "./fatores";

export const metadata = { title: "Segurança" };
export const dynamic = "force-dynamic";

const TIPO: Record<string, string> = { totp: "Aplicativo autenticador", phone: "SMS", webauthn: "Chave de segurança" };

export default async function PaginaSeguranca() {
  const sessao = await exigirSessao();
  const obrigatorio = exigeMfa(sessao.papel);
  const fatores = await listarFatores();
  const verificados = fatores.filter((f) => f.status === "verified");
  const cadastrarHref = "/mfa/cadastro?voltar=%2Fconfiguracoes%2Fseguranca";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Configurações</h1>
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes/seguranca" />

      {obrigatorio ? (
        <Alert tom="info" titulo="Segundo fator obrigatório">
          Para sócios e advogados o aplicativo autenticador é obrigatório: sem confirmar o código a cada entrada, processos, prazos, publicações e tarefas não aparecem e nenhuma decisão é aceita. Mantenha ao menos um autenticador cadastrado; se trocar de celular, cadastre o novo antes de remover o antigo.
        </Alert>
      ) : (
        <Alert tom="info">O segundo fator é opcional para o seu papel, mas recomendado: protege a conta mesmo se a senha vazar.</Alert>
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>Autenticadores cadastrados</CardTitle>
            <CardDescription>Aplicativos que geram o código de 6 dígitos pedido ao entrar. A conta é {sessao.email ?? "a sua"}.</CardDescription>
          </div>
          <Link href={cadastrarHref} className="inline-flex h-9 shrink-0 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
            Cadastrar autenticador
          </Link>
        </CardHeader>
        <CardContent>
          {fatores.length === 0 ? (
            <Vazio
              titulo="Nenhum autenticador cadastrado"
              descricao="Cadastre um aplicativo autenticador no celular. Você vai precisar dele para entrar."
              acao={
                <Link href={cadastrarHref} className="text-sm underline">
                  Cadastrar agora
                </Link>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Nome</TH>
                  <TH>Tipo</TH>
                  <TH>Situação</TH>
                  <TH>Cadastrado em</TH>
                  <TH>Ações</TH>
                </TR>
              </THead>
              <TBody>
                {fatores.map((f) => (
                  <TR key={f.id}>
                    <TD>{f.nome ?? "—"}</TD>
                    <TD>{TIPO[f.tipo] ?? f.tipo}</TD>
                    <TD>{f.status === "verified" ? <Badge tom="sucesso">Verificado</Badge> : <Badge tom="alerta">Pendente de verificação</Badge>}</TD>
                    <TD className="whitespace-nowrap text-xs">{formatarDataHora(f.criadoEm)}</TD>
                    <TD>
                      <BotaoRemoverFator id={f.id} nome={f.nome ?? TIPO[f.tipo] ?? f.tipo} ultimoVerificado={obrigatorio && f.status === "verified" && verificados.length === 1} />
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
