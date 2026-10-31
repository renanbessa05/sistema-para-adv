import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { sair } from "@/app/(auth)/login/actions";
import { Button, classesBotao } from "@/components/ui/button";
import { TelaEntrada } from "@/components/dominio/TelaEntrada";
import { UserX } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { envServidor } from "@/lib/config/env";

export default function SemEscritorio() {
  if (envServidor().ONBOARDING_ATIVO === "true") redirect("/onboarding");
  return (
    <TelaEntrada>
      <Card className="shadow-md">
        <CardHeader className="pt-7">
          <span className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-ouro-100 text-ouro-600" aria-hidden>
            <UserX className="h-5 w-5" />
          </span>
          <CardTitle className="text-xl">Seu usuário ainda não está vinculado a um escritório</CardTitle>
          <CardDescription>
            Peça a um sócio para convidar o seu e-mail em Configurações → Equipe. Se o convite acabou de ser aceito, saia e entre de novo para atualizar o acesso.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col-reverse gap-2 pb-7 sm:flex-row sm:items-center sm:justify-between">
          <form action={sair}>
            <Button type="submit" variante="contorno" className="w-full sm:w-auto">
              Sair
            </Button>
          </form>
          <Link href="/convite/aceitar" className={classesBotao({ className: "w-full sm:w-auto" })}>
            Tenho um convite pendente
          </Link>
        </CardContent>
      </Card>
    </TelaEntrada>
  );
}
