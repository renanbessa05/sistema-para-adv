import Link from "next/link";
import { Building2, CalendarClock, ChevronRight, MessageCircle, Settings2, ShieldCheck } from "lucide-react";
import { exigirSessao } from "@/server/sessao";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { areasPara, GRUPOS_AREA, NavegacaoConfiguracoes, type GrupoArea } from "./navegacao";

export const metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

const ICONE_GRUPO: Record<GrupoArea, { Icone: React.ComponentType<{ className?: string }>; cor: string }> = {
  Escritório: { Icone: Building2, cor: "bg-marca-50 text-marca-600" },
  "Prazos e processos": { Icone: CalendarClock, cor: "bg-ouro-100 text-ouro-600" },
  Comunicação: { Icone: MessageCircle, cor: "bg-emerald-50 text-emerald-600" },
  Operação: { Icone: Settings2, cor: "bg-zinc-100 text-zinc-600" },
  Conformidade: { Icone: ShieldCheck, cor: "bg-red-50 text-red-600" },
};

export default async function PaginaConfiguracoes() {
  const sessao = await exigirSessao();
  const areas = areasPara(sessao.papel);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-950">Configurações</h1>
          <p className="text-sm text-zinc-500">Como o escritório funciona: equipe, prazos, canais, rotinas e conformidade.</p>
        </div>
      </div>
      <NavegacaoConfiguracoes papel={sessao.papel} atual="/configuracoes" />
      {sessao.papel !== "socio" ? <Alert tom="info">Configurações do escritório, atos, fases e notificações são do sócio. Você pode cuidar do seu telefone, das suas ausências{sessao.papel === "administrativo" ? ", do calendário forense e das ausências da equipe" : ""}.</Alert> : null}
      {GRUPOS_AREA.map((grupo) => {
        const doGrupo = areas.filter((a) => a.grupo === grupo);
        if (doGrupo.length === 0) return null;
        const { Icone, cor } = ICONE_GRUPO[grupo];
        return (
          <section key={grupo} className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] text-zinc-400 uppercase after:h-px after:flex-1 after:bg-zinc-200/80">{grupo}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {doGrupo.map((a) => (
                <Link key={a.href} href={a.href} className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-500/40 focus-visible:ring-offset-2">
                  <Card className="h-full transition-[box-shadow,border-color] group-hover:border-zinc-300 group-hover:shadow-md">
                    <CardContent className="flex h-full items-start gap-3.5 p-4">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${cor}`} aria-hidden>
                        <Icone className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-bold text-zinc-950 group-hover:text-marca-700">{a.rotulo}</span>
                        <span className="mt-0.5 block text-[12.5px] leading-snug text-zinc-500">{a.descricao}</span>
                      </span>
                      <ChevronRight className="mt-2.5 h-4 w-4 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-marca-600" aria-hidden />
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
