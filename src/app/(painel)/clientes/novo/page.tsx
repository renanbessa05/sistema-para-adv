import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { podeEditarProcesso } from "@/server/processos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, classesBotao } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { CamposCliente } from "../formulario-cliente";
import { criarCliente } from "../actions";

export const metadata = { title: "Novo cliente" };
export const dynamic = "force-dynamic";

export default async function PaginaNovoCliente({ searchParams }: { searchParams: Promise<{ erro?: string; voltar?: string }> }) {
  const sessao = await exigirSessao();
  if (!podeEditarProcesso(sessao.papel)) redirect(`/clientes?erro=${encodeURIComponent("Estagiário não cadastra cliente.")}`);
  const { erro, voltar } = await searchParams;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="min-w-0">
        <Link href="/clientes" className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-500 hover:text-marca-700">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Clientes
        </Link>
        <h1 className="mt-1 text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Novo cliente</h1>
        <p className="text-sm text-zinc-500">Só o nome é obrigatório. CPF/CNPJ e endereço entram depois na qualificação do contrato e da procuração.</p>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      <form action={criarCliente} className="flex flex-col gap-4">
        {voltar?.startsWith("/") ? <input type="hidden" name="voltar" value={voltar} /> : null}
        <Card>
          <CardHeader>
            <CardTitle>Dados</CardTitle>
            <CardDescription>Cadastro da pessoa física ou jurídica que o escritório representa.</CardDescription>
          </CardHeader>
          <CardContent>
            <CamposCliente />
          </CardContent>
        </Card>
        <div className="flex flex-wrap justify-end gap-2">
          <Link href="/clientes" className={classesBotao({ variante: "contorno" })}>
            Cancelar
          </Link>
          <Button type="submit">Salvar</Button>
        </div>
      </form>
    </div>
  );
}
