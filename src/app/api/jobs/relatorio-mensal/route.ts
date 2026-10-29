import { rotaDeJob } from "../_rota";
import { relatorioMensal } from "@/server/jobs/relatorio-mensal";

export const maxDuration = 120;

export const GET = rotaDeJob("relatorio-mensal", (admin) => relatorioMensal(admin));
