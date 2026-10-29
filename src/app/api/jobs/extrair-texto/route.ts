import { rotaDeJob } from "../_rota";
import { extrairTextoPendentes } from "@/server/jobs/extrair-texto";

export const maxDuration = 300;

export const GET = rotaDeJob("extrair-texto", (admin) => extrairTextoPendentes(admin));
