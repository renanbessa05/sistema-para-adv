import { rotaDeJob } from "../_rota";
import { backupTenant } from "@/server/jobs/backup";

export const maxDuration = 300;
export const GET = rotaDeJob("backup-tenant", (admin) => backupTenant(admin));
