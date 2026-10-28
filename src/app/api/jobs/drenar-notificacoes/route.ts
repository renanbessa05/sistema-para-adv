import { rotaDeJob } from "../_rota";
import { drenarNotificacoes } from "@/server/notificacoes";
import { executarJob } from "@/server/jobs/registro";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = rotaDeJob("drenar-notificacoes", (admin) => executarJob(admin, "drenar-notificacoes", async () => { const r = await drenarNotificacoes(admin, { limite: 100 }); return { itens: r.enviadas + r.painel, detalhes: r }; }));
