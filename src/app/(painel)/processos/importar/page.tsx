import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { podeImportarCarteira } from "@/server/processos";
import { COLUNAS_CSV } from "@/server/importar-carteira";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormularioImportacao } from "./formulario";

export const metadata = { title: "Importar carteira" };
export const dynamic = "force-dynamic";

export default async function PaginaImportar() {
  const sessao = await exigirSessao();
  if (!podeImportarCarteira(sessao.papel)) redirect(`/processos?erro=${encodeURIComponent("Estagiário não importa carteira.")}`);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <Link href="/processos" className="text-sm text-zinc-500 hover:underline">
          ← Processos
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Importar carteira (CSV)</h1>
        <p className="text-sm text-zinc-500">Envie o arquivo, confira a pré-visualização e confirme. Processos já cadastrados não são duplicados; o DataJud completa os dados em seguida.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Formato esperado</CardTitle>
          <CardDescription>Separador ; ou , (detectado automaticamente), primeira linha com os nomes das colunas. Obrigatórias: numero_cnj e cliente.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <code className="block overflow-x-auto rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-900">{COLUNAS_CSV.join(";")}</code>
          <ul className="mt-2 list-disc pl-5 text-xs text-zinc-600 dark:text-zinc-400">
            <li>polo: ativo, passivo, terceiro ou outro (aceita autor/réu); vazio = ativo.</li>
            <li>responsavel: e-mail ou nome de um membro da equipe. colaboradores: vários, separados por | .</li>
            <li>sigiloso: s ou n (só advogado e sócio conseguem marcar o sigilo).</li>
            <li>comarca: nome exatamente como em Configurações → Calendário (TJ-MT). Se não bater, o DataJud tenta preencher.</li>
          </ul>
        </CardContent>
      </Card>
      <FormularioImportacao />
    </div>
  );
}
