import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { TelaEntrada } from "@/components/dominio/TelaEntrada";
import { FormularioLogin } from "./formulario";

export const metadata = { title: "Entrar" };

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<{ voltar?: string; erro?: string; enviado?: string }> }) {
  const { voltar, erro, enviado } = await searchParams;
  return (
    <TelaEntrada>
      <Card className="shadow-md">
        <CardHeader className="pt-7">
          <CardTitle className="text-xl">Entrar</CardTitle>
          <CardDescription>Use o e-mail cadastrado pelo escritório. Você recebe um link de acesso; não há senha.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pb-7">
          {erro ? <Alert tom="perigo">{erro}</Alert> : null}
          {enviado ? (
            <Alert tom="sucesso" titulo="Link enviado">
              Abra o e-mail e clique no link para entrar. Se não chegar em um minuto, confira o lixo eletrônico.
            </Alert>
          ) : null}
          <FormularioLogin voltar={voltar ?? "/hoje"} />
        </CardContent>
      </Card>
      <p className="mt-5 text-center text-xs text-zinc-500">Problemas para entrar? Fale com um sócio do escritório.</p>
    </TelaEntrada>
  );
}
