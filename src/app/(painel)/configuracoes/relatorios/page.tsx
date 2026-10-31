import { redirect } from "next/navigation";
import { exigirSessao, type Papel } from "@/server/sessao";
import { Alert } from "@/components/ui/alert";
import { Abas, abaAtual, type Aba } from "@/components/dominio/Abas";
import { NavegacaoConfiguracoes } from "../navegacao";
import { ProdutividadeMes } from "./ProdutividadeMes";
import { MetricasTrintaDias } from "./MetricasTrintaDias";
import { CustoIa } from "./CustoIa";
import { RelatorioMensalCsv } from "./RelatorioMensalCsv";

export const metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

const BASE = "/configuracoes/relatorios";

/** Abas de Relatórios e quem as vê. Produtividade: sócio e advogado; as demais, só o sócio. */
const ABAS: (Aba & { papeis: Papel[] })[] = [
  { chave: "produtividade", rotulo: "Produtividade", papeis: ["socio", "advogado"] },
  { chave: "metricas", rotulo: "Métricas (30 dias)", papeis: ["socio"] },
  { chave: "ia", rotulo: "Custo de IA", papeis: ["socio"] },
  { chave: "csv", rotulo: "Relatório mensal (CSV)", papeis: ["socio"] },
];

/**
 * Relatórios do escritório em uma tela só, por aba (`?aba=produtividade|metricas|ia|csv`). As abas que o papel não
 * vê ficam escondidas, e pedir uma delas pela query cai na primeira permitida (regra de `abaAtual`).
 */
export default async function PaginaRelatorios({ searchParams }: { searchParams: Promise<{ aba?: string; mes?: string; erro?: string; ok?: string }> }) {
  const sessao = await exigirSessao();
  const abas = ABAS.filter((a) => a.papeis.includes(sessao.papel));
  if (abas.length === 0) redirect("/configuracoes");
  const { aba, mes, erro, ok } = await searchParams;
  const atual = abaAtual(abas, aba);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Configurações</h1>
      <NavegacaoConfiguracoes papel={sessao.papel} atual={BASE} />
      <Abas base={BASE} abas={abas} atual={atual} />
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {ok ? <Alert tom="sucesso">{ok}</Alert> : null}

      {atual === "produtividade" ? <ProdutividadeMes base={`${BASE}?aba=produtividade`} mes={mes} /> : null}
      {atual === "metricas" ? <MetricasTrintaDias /> : null}
      {atual === "ia" ? <CustoIa escritorioId={sessao.escritorioId} /> : null}
      {atual === "csv" ? <RelatorioMensalCsv escritorioId={sessao.escritorioId} /> : null}
    </div>
  );
}
