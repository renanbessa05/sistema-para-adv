import { rotaDeJob } from "../_rota";
import { enviarMensagensCliente } from "@/server/atendimento-cliente";
import { executarJob } from "@/server/jobs/registro";

export const maxDuration = 300;
export const GET = rotaDeJob("enviar-mensagens-cliente", (admin) => executarJob(admin, "enviar-mensagens-cliente", async () => { const r = await enviarMensagensCliente(admin, { limite: 50 }); return { itens: r.enviadas, detalhes: r }; }));
