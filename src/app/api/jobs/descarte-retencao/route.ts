import { rotaDeJob } from "../_rota";
import { descarteRetencao } from "@/server/jobs/descarte-retencao";

export const maxDuration = 300;

export const GET = rotaDeJob("descarte-retencao", (admin) => descarteRetencao(admin));
