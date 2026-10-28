import { rotaDeJob } from "../_rota";
import { captacaoVigilante } from "@/server/jobs/operacao";

export const GET = rotaDeJob("captacao-vigilante", (admin) => captacaoVigilante(admin));
