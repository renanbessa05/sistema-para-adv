import { rotaDeJob } from "../_rota";
import { alertasDePrazo } from "@/server/jobs/alertas";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = rotaDeJob("alertas-prazo", (admin) => alertasDePrazo(admin));
