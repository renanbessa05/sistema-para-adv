import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { envServidor } from "@/lib/config/env";
import { formatarDataHora } from "@/lib/utils";
import { DEFINICOES_INTEGRACAO, origemDoSegredo, rotuloOrigem, TIPOS_INTEGRACAO_COM_SEGREDO, type OrigemSegredo, type TipoIntegracaoComSegredo } from "@/lib/integracoes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Campo, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { NavegacaoConfiguracoes } from "../navegacao";
import { removerSegredo, salvarSegredo } from "./actions";

export const metadata = { title: "Integrações" };
export const dynamic = "force-dynamic";

interface LinhaIntegracao {
  tipo: string;
  config: Record<string, unknown> | null;
  vault_secret_id: string | null;
  status: string;
  ultimo_erro: string | null;
  atualizado_em: string;
}

const ROTULO_STATUS: Record<string, string> = { ativa: "Ativa", inativa: "Inativa", erro: "Com erro" };
const TOM_STATUS: Record<string, "sucesso" | "alerta" | "perigo" | "neutro"> = { ativa: "sucesso", erro: "perigo", inativa: "neutro" };
const TOM_ORIGEM: Record<string, "sucesso" | "alerta" | "neutro"> = { vault: "sucesso", ambiente: "alerta", nenhum: "neutro" };

function temVariavel(nome: string): boolean {
  const v = (envServidor() as unknown as Record<string, unknown>)[nome];
  return typeof v === "string" && v.trim() !== "";
}

export default async function PaginaIntegracoes({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") redirect("/configuracoes");
  const { erro, ok } = await searchParams;
  const supabase = await criarClienteServidor();
  const [{ data: linhas }, { data: esc }] = await Promise.all([
    supabase.from("integracoes").select("tipo, config, vault_secret_id, status, ultimo_erro, atualizado_em").eq("escritorio_id", sessao.escritorioId),
    supabase.from("escritorios").select("timezone").eq("id", sessao.escritorioId).maybeSingle(),
  ]);
  const timeZone = (esc?.timezone as string | undefined) ?? "America/Cuiaba";
  const porTipo = new Map<string, LinhaIntegracao>(((linhas ?? []) as LinhaIntegracao[]).map((l) => [l.tipo, l]));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Configurações</h1>
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes/integracoes" />
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}
      <Alert tom="info">
        O segredo vai direto para o Supabase Vault e nunca é exibido de volta: para trocar, cole o novo valor e salve. Enquanto não houver segredo no Vault, vale a variável de ambiente da Vercel. Passo a passo em <code>docs/runbooks/rotacao-de-segredos.md</code>.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        {TIPOS_INTEGRACAO_COM_SEGREDO.map((tipo) => (
          <CartaoIntegracao key={tipo} tipo={tipo} linha={porTipo.get(tipo) ?? null} timeZone={timeZone} temAmbiente={temVariavel(DEFINICOES_INTEGRACAO[tipo].variavelSegredo)} configAmbiente={Object.fromEntries(Object.entries(DEFINICOES_INTEGRACAO[tipo].variaveisConfig).map(([chave, variavel]) => [chave, temVariavel(variavel)]))} />
        ))}
      </div>
    </div>
  );
}

function CartaoIntegracao({ tipo, linha, timeZone, temAmbiente, configAmbiente }: { tipo: TipoIntegracaoComSegredo; linha: LinhaIntegracao | null; timeZone: string; temAmbiente: boolean; configAmbiente: Record<string, boolean> }) {
  const def = DEFINICOES_INTEGRACAO[tipo];
  const origem: OrigemSegredo = origemDoSegredo({ temVault: Boolean(linha?.vault_secret_id), temAmbiente });
  const status = linha?.status ?? "inativa";
  const config = (linha?.config ?? {}) as Record<string, unknown>;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{def.rotulo}</CardTitle>
          <div className="flex flex-wrap gap-1">
            <Badge tom={TOM_STATUS[status] ?? "neutro"}>{ROTULO_STATUS[status] ?? status}</Badge>
            <Badge tom={TOM_ORIGEM[origem ?? "nenhum"]}>segredo: {rotuloOrigem(origem)}</Badge>
          </div>
        </div>
        <CardDescription>
          {linha ? `Atualizado em ${formatarDataHora(linha.atualizado_em, timeZone)}.` : "Ainda sem configuração gravada neste escritório."}
          {origem === "ambiente" ? ` Em uso: ${def.variavelSegredo} da Vercel (fallback).` : ""}
          {origem === null ? " Sem segredo: a integração não funciona até você gravar um aqui." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {linha?.ultimo_erro ? (
          <Alert tom="perigo" titulo="Último erro">
            {linha.ultimo_erro}
          </Alert>
        ) : null}
        <form action={salvarSegredo} className="flex flex-col gap-3" autoComplete="off">
          <input type="hidden" name="tipo" value={tipo} />
          <Campo label={def.rotuloSegredo}>
            <Input name="segredo" type="password" required minLength={8} autoComplete="new-password" placeholder={origem ? "Cole o novo valor para trocar" : "Cole o valor"} />
          </Campo>
          {Object.entries(def.rotulosConfig).map(([chave, rotulo]) => (
            <Campo key={chave} label={rotulo}>
              <Input name={chave} inputMode="numeric" required defaultValue={typeof config[chave] === "string" ? (config[chave] as string) : ""} placeholder={configAmbiente[chave] ? `hoje vem de ${def.variaveisConfig[chave]}` : ""} />
            </Campo>
          ))}
          <div className="flex justify-end">
            <Button type="submit">Salvar no Vault</Button>
          </div>
        </form>
        {linha?.vault_secret_id ? (
          <form action={removerSegredo} className="flex justify-end border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <input type="hidden" name="tipo" value={tipo} />
            <Button type="submit" variante="perigo" tamanho="sm">
              Remover do Vault
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
