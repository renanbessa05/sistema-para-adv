import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="min-w-0">
        <Link href="/processos" className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-500 hover:text-marca-700">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Processos
        </Link>
        <h1 className="mt-1 text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Importar carteira (CSV)</h1>
        <p className="text-sm text-zinc-500">Envie o arquivo, confira a pré-visualização e confirme. Processos já cadastrados não são duplicados; o DataJud completa os dados em seguida.</p>
      </div>
      <Card>
        <CardHeader className="flex-row items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-marca-50 text-marca-600" aria-hidden>
            <FileSpreadsheet className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle>Formato esperado</CardTitle>
            <CardDescription className="mt-1">Separador ; ou , (detectado automaticamente), primeira linha com os nomes das colunas. Obrigatórias: numero_cnj e cliente.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <code className="block overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 font-mono text-xs text-zinc-700">{COLUNAS_CSV.join(";")}</code>
          <ul className="grid gap-1.5 text-xs leading-relaxed text-zinc-600 sm:grid-cols-2">
            <li className="rounded-lg bg-zinc-50 px-3 py-2">
              <span className="font-semibold text-zinc-800">polo:</span> ativo, passivo, terceiro ou outro (aceita autor/réu); vazio = ativo.
            </li>
            <li className="rounded-lg bg-zinc-50 px-3 py-2">
              <span className="font-semibold text-zinc-800">responsavel:</span> e-mail ou nome de um membro da equipe. <span className="font-semibold text-zinc-800">colaboradores:</span> vários, separados por | .
            </li>
            <li className="rounded-lg bg-zinc-50 px-3 py-2">
              <span className="font-semibold text-zinc-800">sigiloso:</span> s ou n (só advogado e sócio conseguem marcar o sigilo).
            </li>
            <li className="rounded-lg bg-zinc-50 px-3 py-2">
              <span className="font-semibold text-zinc-800">comarca:</span> nome exatamente como em Configurações → Calendário (TJ-MT). Se não bater, o DataJud tenta preencher.
            </li>
          </ul>
        </CardContent>
      </Card>
      <FormularioImportacao />
    </div>
  );
}
