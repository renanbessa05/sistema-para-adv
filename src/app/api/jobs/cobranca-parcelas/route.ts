import { rotaDeJob } from "../_rota";
import { cobrarParcelas } from "@/server/jobs/cobranca-parcelas";

export const maxDuration = 120;

export const GET = rotaDeJob("cobranca-parcelas", (admin) => cobrarParcelas(admin));
