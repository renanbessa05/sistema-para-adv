import { rotaDeJob } from "../_rota";
import { alertarIa } from "@/server/jobs/alertas-ia";

export const maxDuration = 120;

export const GET = rotaDeJob("alertas-ia", (admin) => alertarIa(admin));
