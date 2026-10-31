import Link from "next/link";
import { exigirSessao } from "@/server/sessao";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { areasPara, GRUPOS_AREA, NavegacaoConfiguracoes } from "./navegacao";

export const metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

export default async function PaginaConfiguracoes() {
  const sessao = await exigirSessao();
  const areas = areasPara(sessao.papel);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Configurações</h1>
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes" />
      {sessao.papel !== "socio" ? <Alert tom="info">Configurações do escritório, atos, fases e notificações são do sócio. Você pode cuidar do seu telefone, das suas ausências{sessao.papel === "administrativo" ? ", do calendário forense e das ausências da equipe" : ""}.</Alert> : null}
      {GRUPOS_AREA.map((grupo) => {
        const doGrupo = areas.filter((a) => a.grupo === grupo);
        if (doGrupo.length === 0) return null;
        return (
          <section key={grupo} className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{grupo}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {doGrupo.map((a) => (
                <Link key={a.href} href={a.href}>
                  <Card className="h-full transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900">
                    <CardContent className="p-4">
                      <p className="font-medium">{a.rotulo}</p>
                      <p className="text-sm text-zinc-500">{a.descricao}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
