import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { sair } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function SemEscritorio() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Seu usuário ainda não está vinculado a um escritório</CardTitle>
          <CardDescription>
            Peça a um sócio para convidar o seu e-mail em Configurações → Equipe. Se o convite acabou de ser aceito, saia e entre de novo para atualizar o acesso.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Link href="/convite/aceitar" className="text-sm underline">
            Tenho um convite pendente
          </Link>
          <form action={sair}>
            <Button type="submit" variante="contorno">
              Sair
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
