import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { podeEditarProcesso } from "@/server/processos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <Link href="/clientes" className="text-sm text-zinc-500 hover:underline">
          ← Clientes
        </Link>
        <h1 className="text-xl font-semibold">Novo cliente</h1>
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      <form action={criarCliente} className="flex flex-col gap-4">
        {voltar?.startsWith("/") ? <input type="hidden" name="voltar" value={voltar} /> : null}
        <Card>
          <CardHeader>
            <CardTitle>Dados</CardTitle>
          </CardHeader>
          <CardContent>
            <CamposCliente />
          </CardContent>
        </Card>
        <div className="flex justify-end gap-2">
          <Link href="/clientes" className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Cancelar
          </Link>
          <Button type="submit">Salvar</Button>
        </div>
      </form>
    </div>
  );
}
