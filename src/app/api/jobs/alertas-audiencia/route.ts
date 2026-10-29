import { rotaDeJob } from "../_rota";
import { alertarAudiencias } from "@/server/jobs/alertas-audiencia";

export const maxDuration = 120;

export const GET = rotaDeJob("alertas-audiencia", (admin) => alertarAudiencias(admin));
