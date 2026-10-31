import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { exigeMfa, listarFatores } from "@/server/mfa";
import { formatarDataHora } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Vazio } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { classesBotao } from "@/components/ui/button";
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Configurações</h1>
          <p className="text-sm text-zinc-500">Segundo fator da sua conta: aplicativos autenticadores cadastrados.</p>
        </div>
      </div>
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes/seguranca" />

      {obrigatorio ? (
        <Alert tom="info" titulo="Segundo fator obrigatório">
          Para sócios e advogados o aplicativo autenticador é obrigatório: sem confirmar o código a cada entrada, processos, prazos, publicações e tarefas não aparecem e nenhuma decisão é aceita. Mantenha ao menos um autenticador cadastrado; se trocar de celular, cadastre o novo antes de remover o antigo.
        </Alert>
      ) : (
        <Alert tom="info">O segundo fator é opcional para o seu papel, mas recomendado: protege a conta mesmo se a senha vazar.</Alert>
      )}

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-marca-600" aria-hidden />
              Autenticadores cadastrados
            </CardTitle>
            <CardDescription>Aplicativos que geram o código de 6 dígitos pedido ao entrar. A conta é {sessao.email ?? "a sua"}.</CardDescription>
          </div>
          <Link href={cadastrarHref} className={classesBotao({ variante: "primaria", tamanho: "sm" })}>
            Cadastrar autenticador
          </Link>
        </CardHeader>
        <CardContent>
          {fatores.length === 0 ? (
            <Vazio
              titulo="Nenhum autenticador cadastrado"
              descricao="Cadastre um aplicativo autenticador no celular. Você vai precisar dele para entrar."
              acao={
                <Link href={cadastrarHref} className={classesBotao({ variante: "contorno", tamanho: "sm" })}>
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
                    <TD className="font-semibold text-zinc-950">{f.nome ?? "—"}</TD>
                    <TD>{TIPO[f.tipo] ?? f.tipo}</TD>
                    <TD>{f.status === "verified" ? <Badge tom="sucesso">Verificado</Badge> : <Badge tom="alerta">Pendente de verificação</Badge>}</TD>
                    <TD className="text-xs whitespace-nowrap text-zinc-500 tabular-nums">{formatarDataHora(f.criadoEm)}</TD>
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
