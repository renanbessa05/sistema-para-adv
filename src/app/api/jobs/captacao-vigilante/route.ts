import { rotaDeJob } from "../_rota";
import { captacaoVigilante } from "@/server/jobs/operacao";

export const dynamic = "force-dynamic";
export const GET = rotaDeJob("captacao-vigilante", (admin) => captacaoVigilante(admin));
