import { rotaDeJob } from "../_rota";
import { verificarBackup } from "@/server/jobs/backup";

export const maxDuration = 120;
export const GET = rotaDeJob("verificar-backup", (admin) => verificarBackup(admin));
