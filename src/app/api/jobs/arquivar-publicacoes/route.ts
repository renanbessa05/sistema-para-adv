import { rotaDeJob } from "../_rota";
import { arquivarPublicacoes } from "@/server/jobs/arquivar-publicacoes";

export const maxDuration = 300;

export const GET = rotaDeJob("arquivar-publicacoes", (admin) => arquivarPublicacoes(admin));
