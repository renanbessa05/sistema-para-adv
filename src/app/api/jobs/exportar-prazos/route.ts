import { rotaDeJob } from "../_rota";
import { exportarPrazos } from "@/server/jobs/operacao";

export const maxDuration = 300;
export const GET = rotaDeJob("exportar-prazos", (admin) => exportarPrazos(admin));
