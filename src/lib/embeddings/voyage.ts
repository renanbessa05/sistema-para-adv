/**
 * Embeddings pela Voyage AI (modelo jurídico voyage-law-2, 1024 dimensões). Sem chave, o sistema não chama a API:
 * a busca segue só por texto. O cliente recebe o fetch por injeção para os testes.
 */
export const URL_VOYAGE = "https://api.voyageai.com/v1/embeddings";
export const DIMENSOES = 1024;
export const MODELO_PADRAO = "voyage-law-2";

export class ErroEmbeddings extends Error {}

export interface ClienteEmbeddings {
  gerar(textos: string[], tipo: "document" | "query"): Promise<number[][]>;
}

export interface OpcoesVoyage {
  chave: string;
  modelo?: string;
  fetch?: typeof fetch;
}

export function criarClienteVoyage(opcoes: OpcoesVoyage): ClienteEmbeddings {
  const f = opcoes.fetch ?? fetch;
  const modelo = opcoes.modelo ?? MODELO_PADRAO;
  return {
    async gerar(textos, tipo) {
      if (textos.length === 0) return [];
      const resp = await f(URL_VOYAGE, {
        method: "POST",
        headers: { Authorization: `Bearer ${opcoes.chave}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input: textos, model: modelo, input_type: tipo }),
      });
      if (!resp.ok) throw new ErroEmbeddings(`Voyage respondeu ${resp.status}`);
      const corpo = (await resp.json()) as { data?: { embedding: number[]; index: number }[] };
      const linhas = corpo.data ?? [];
      if (linhas.length !== textos.length) throw new ErroEmbeddings("Voyage devolveu menos embeddings que textos enviados");
      const ordenados = [...linhas].sort((a, b) => a.index - b.index).map((l) => l.embedding);
      for (const v of ordenados) {
        if (v.length !== DIMENSOES) throw new ErroEmbeddings(`Dimensão ${v.length} em vez de ${DIMENSOES}`);
      }
      return ordenados;
    },
  };
}

/** Falso determinístico para testes: mesmo texto, mesmo vetor; textos diferentes, vetores diferentes. */
export function criarClienteEmbeddingsFalso(): ClienteEmbeddings {
  return {
    async gerar(textos) {
      return textos.map((t) => {
        let semente = 0;
        for (const ch of t) semente = (semente * 31 + ch.codePointAt(0)!) % 1_000_003;
        return Array.from({ length: DIMENSOES }, (_, i) => Math.sin((semente + 1) * (i + 1)));
      });
    },
  };
}

/** Formato aceito pelo pgvector na RPC: '[0.1,0.2,...]'. */
export function comoVetorSql(v: number[]): string {
  return `[${v.join(",")}]`;
}
