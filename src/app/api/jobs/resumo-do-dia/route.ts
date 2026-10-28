import { rotaDeJob } from "../_rota";
import { resumoDoDia } from "@/server/jobs/resumo-do-dia";

export const maxDuration = 300;
export const GET = rotaDeJob("resumo-do-dia", (admin) => resumoDoDia(admin));
