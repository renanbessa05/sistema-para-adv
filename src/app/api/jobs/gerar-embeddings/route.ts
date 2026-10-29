import { rotaDeJob } from "../_rota";
import { gerarEmbeddingsPendentes } from "@/server/jurisprudencia";

export const maxDuration = 120;

export const GET = rotaDeJob("gerar-embeddings", async () => {
  return [{ ok: true, ...(await gerarEmbeddingsPendentes()) }];
});
