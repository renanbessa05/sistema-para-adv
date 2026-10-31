import { redirect } from "next/navigation";

/** Rota antiga. A produtividade por pessoa agora é a aba Produtividade de Configurações › Relatórios; o mês pedido é preservado. */
export default async function PaginaRelatoriosAntiga({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams;
  redirect(`/configuracoes/relatorios?aba=produtividade${mes ? `&mes=${encodeURIComponent(mes)}` : ""}`);
}
