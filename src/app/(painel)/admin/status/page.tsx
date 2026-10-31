import { exigirSessao } from "@/server/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatarDataHora } from "@/lib/utils";
import { redirect } from "next/navigation";
import { ROTINAS_MONITORADAS, avaliarRotinas } from "@/lib/operacao/rotinas";
import { Alert } from "@/components/ui/alert";

export const metadata = { title: "Rotinas" };
export const dynamic = "force-dynamic";

/** Sócio, advogado, administrativo e suporte veem a operação (regra do menu antigo). Rotina sem execução no limite dela aparece em alerta. */
export default async function PaginaStatus() {
  const sessao = await exigirSessao();
  if (!["socio", "advogado", "administrativo", "suporte"].includes(sessao.papel)) redirect("/hoje");
  // Leitura com service role, filtrada pelo escritório da sessão: jobs_execucoes não tem policy para usuários.
  const admin = criarClienteAdmin();
  const { data: execucoes } = await admin.from("jobs_execucoes").select("job, iniciado_em, finalizado_em, status, itens, erro, detalhes").or(`escritorio_id.eq.${sessao.escritorioId},escritorio_id.is.null`).order("iniciado_em", { ascending: false }).limit(500);
  const { data: captacoes } = await admin.from("captacoes").select("iniciada_em, finalizada_em, status, itens_recebidos, itens_novos, itens_duplicados, erros").eq("escritorio_id", sessao.escritorioId).order("iniciada_em", { ascending: false }).limit(10);
  const { data: backups } = await admin.from("backups_tenant").select("gerado_em, tamanho_bytes, status, erro, contagens").eq("escritorio_id", sessao.escritorioId).order("gerado_em", { ascending: false }).limit(5);

  const ultimaPorJob = new Map<string, (typeof execucoes extends (infer T)[] | null ? T : never)>();
  for (const e of execucoes ?? []) if (!ultimaPorJob.has(e.job)) ultimaPorJob.set(e.job, e);

  const alertas = avaliarRotinas(
    ROTINAS_MONITORADAS.map((rotina) => {
      const e = ultimaPorJob.get(rotina);
      return { rotina, ultimoInicio: e?.iniciado_em ? new Date(e.iniciado_em) : null };
    }),
    new Date(),
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Rotinas</h1>
      {alertas.length > 0 && (
        <Alert tom="perigo" titulo="Rotinas sem execução no prazo">
          <ul className="list-disc pl-5">
            {alertas.map((a) => (
              <li key={a.rotina}>
                <span className="font-mono text-xs">{a.rotina}</span>:{" "}
                {a.motivo === "nunca_executou" ? "nunca executou" : `última execução há ${a.horasSemExecucao} h (limite ${a.limiteHoras} h)`}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Backups do escritório</CardTitle>
          <CardDescription>Snapshot diário em área privada do Supabase. A restauração é manual (runbook restauracao-por-tenant).</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Gerado em</TH>
                <TH>Status</TH>
                <TH>Tamanho</TH>
                <TH>Linhas</TH>
                <TH>Erro</TH>
              </TR>
            </THead>
            <TBody>
              {(backups ?? []).map((b, i) => (
                <TR key={i}>
                  <TD>{formatarDataHora(b.gerado_em)}</TD>
                  <TD>
                    <Badge tom={b.status === "ok" ? "sucesso" : "perigo"}>{b.status}</Badge>
                  </TD>
                  <TD>{b.tamanho_bytes ? `${Math.round(Number(b.tamanho_bytes) / 1024)} KB` : "—"}</TD>
                  <TD>{Object.values((b.contagens as Record<string, number>) ?? {}).reduce((s, n) => s + Number(n), 0)}</TD>
                  <TD className="max-w-md truncate text-xs text-red-700">{b.erro ?? ""}</TD>
                </TR>
              ))}
              {(backups ?? []).length === 0 && (
                <TR>
                  <TD colSpan={5}>Nenhum backup registrado ainda.</TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Última execução de cada rotina</CardTitle>
          <CardDescription>Horários no fuso do escritório. Rotina sem execução ainda não rodou neste ambiente.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Rotina</TH>
                <TH>Início</TH>
                <TH>Fim</TH>
                <TH>Status</TH>
                <TH>Itens</TH>
                <TH>Erro</TH>
              </TR>
            </THead>
            <TBody>
              {ROTINAS_MONITORADAS.map((job) => {
                const e = ultimaPorJob.get(job);
                return (
                  <TR key={job}>
                    <TD className="font-mono text-xs">{job}</TD>
                    <TD>{e ? formatarDataHora(e.iniciado_em) : "—"}</TD>
                    <TD>{e?.finalizado_em ? formatarDataHora(e.finalizado_em) : "—"}</TD>
                    <TD>{e ? <Badge tom={e.status === "ok" ? "sucesso" : e.status === "erro" ? "perigo" : "alerta"}>{e.status}</Badge> : <Badge tom="contorno">nunca rodou</Badge>}</TD>
                    <TD>{e?.itens ?? "—"}</TD>
                    <TD className="max-w-md truncate text-xs text-red-700">{e?.erro ?? ""}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Últimas captações do DJEN</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Início</TH>
                <TH>Status</TH>
                <TH>Recebidas</TH>
                <TH>Novas</TH>
                <TH>Duplicadas</TH>
                <TH>Erros</TH>
              </TR>
            </THead>
            <TBody>
              {(captacoes ?? []).map((c, i) => (
                <TR key={i}>
                  <TD>{formatarDataHora(c.iniciada_em)}</TD>
                  <TD>
                    <Badge tom={c.status === "ok" ? "sucesso" : c.status === "parcial" ? "alerta" : "perigo"}>{c.status}</Badge>
                  </TD>
                  <TD>{c.itens_recebidos ?? 0}</TD>
                  <TD>{c.itens_novos ?? 0}</TD>
                  <TD>{c.itens_duplicados ?? 0}</TD>
                  <TD className="text-xs text-red-700">{Array.isArray(c.erros) ? c.erros.join("; ") : ""}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
