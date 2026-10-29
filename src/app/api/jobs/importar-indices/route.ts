import { rotaDeJob } from "../_rota";
import { importarIndices } from "@/server/calculos";

export const maxDuration = 120;

export const GET = rotaDeJob("importar-indices", async () => {
  const resumo = await importarIndices({ base: process.env.BCB_SGS_BASE_URL ?? "https://api.bcb.gov.br/dados/serie/bcdata.sgs" });
  return [{ ok: true, meses: resumo }];
});
