import { rotaDeJob } from "../_rota";
import { executarJob } from "@/server/jobs/registro";

export const GET = rotaDeJob("atualizar-metricas", (admin) => executarJob(admin, "atualizar-metricas", async () => { const { error } = await admin.rpc("atualizar_metricas_diarias"); if (error) throw new Error(error.message); return { itens: 1 }; }));
