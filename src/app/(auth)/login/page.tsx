import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { FormularioLogin } from "./formulario";

export const metadata = { title: "Entrar" };

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<{ voltar?: string; erro?: string; enviado?: string }> }) {
  const { voltar, erro, enviado } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-900">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Assistente Jurídica</CardTitle>
          <CardDescription>Entre com o e-mail cadastrado pelo escritório.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {erro ? <Alert tom="perigo">{erro}</Alert> : null}
          {enviado ? <Alert tom="sucesso">Link enviado. Abra o e-mail e clique para entrar.</Alert> : null}
          <FormularioLogin voltar={voltar ?? "/hoje"} />
        </CardContent>
      </Card>
    </main>
  );
}
