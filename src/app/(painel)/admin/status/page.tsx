import { exigirSessao } from "@/server/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatarDataHora } from "@/lib/utils";
import { redirect } from "next/navigation";

export const metadata = { title: "Rotinas" };
export const dynamic = "force-dynamic";

const JOBS = ["captar-djen", "classificar", "enriquecer-datajud", "drenar-notificacoes", "alertas-publicacao", "alertas-prazo", "resumo-do-dia", "marcar-vencidos", "exportar-prazos", "atualizar-metricas", "captacao-vigilante"];

export default async function PaginaStatus() {
  const sessao = await exigirSessao();
  if (!["socio", "advogado", "administrativo"].includes(sessao.papel)) redirect("/hoje");
  // Leitura com service role, filtrada pelo escritório da sessão: jobs_execucoes não tem policy para usuários.
  const admin = criarClienteAdmin();
  const { data: execucoes } = await admin.from("jobs_execucoes").select("job, iniciado_em, finalizado_em, status, itens, erro, detalhes").or(`escritorio_id.eq.${sessao.escritorioId},escritorio_id.is.null`).order("iniciado_em", { ascending: false }).limit(300);
  const { data: captacoes } = await admin.from("captacoes").select("iniciada_em, finalizada_em, status, itens_recebidos, itens_novos, itens_duplicados, erros").eq("escritorio_id", sessao.escritorioId).order("iniciada_em", { ascending: false }).limit(10);

  const ultimaPorJob = new Map<string, (typeof execucoes extends (infer T)[] | null ? T : never)>();
  for (const e of execucoes ?? []) if (!ultimaPorJob.has(e.job)) ultimaPorJob.set(e.job, e);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Rotinas</h1>
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
              {JOBS.map((job) => {
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
