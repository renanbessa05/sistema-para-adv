import { redirect } from "next/navigation";

/** Rota antiga. As métricas dos últimos 30 dias agora são a aba Métricas de Configurações › Relatórios (só sócio; a página decide). */
export default function PaginaMetricasAntiga() {
  redirect("/configuracoes/relatorios?aba=metricas");
}
