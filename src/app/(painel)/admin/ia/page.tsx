import { redirect } from "next/navigation";

/** Rota antiga (ainda usada nos alertas de custo de IA). O custo de IA agora é a aba Custo de IA de Configurações › Relatórios (só sócio; a página decide). */
export default function PaginaIaAntiga() {
  redirect("/configuracoes/relatorios?aba=ia");
}
