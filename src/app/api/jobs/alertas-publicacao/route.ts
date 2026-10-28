import { rotaDeJob } from "../_rota";
import { alertasDePublicacao } from "@/server/jobs/alertas";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = rotaDeJob("alertas-publicacao", (admin) => alertasDePublicacao(admin));
