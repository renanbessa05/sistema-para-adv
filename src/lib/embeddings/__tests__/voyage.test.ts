import { describe, expect, it } from "vitest";
import { comoVetorSql, criarClienteEmbeddingsFalso, criarClienteVoyage, DIMENSOES, ErroEmbeddings, MODELO_PADRAO, URL_VOYAGE } from "../voyage";

const vetor = (valor: number) => Array.from({ length: DIMENSOES }, () => valor);

function fetchFalso(resposta: Response | ((corpo: unknown) => Response), capturado: { url?: string; init?: RequestInit } = {}): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    capturado.url = String(url);
    capturado.init = init;
    const corpo = JSON.parse(String(init?.body));
    return typeof resposta === "function" ? resposta(corpo) : resposta;
  }) as typeof fetch;
}

describe("cliente Voyage", () => {
  it("envia o modelo padrão, o tipo e a chave, e devolve os vetores na ordem dos textos", async () => {
    const capturado: { url?: string; init?: RequestInit } = {};
    const fetchF = fetchFalso(
      () => new Response(JSON.stringify({ data: [{ embedding: vetor(2), index: 1 }, { embedding: vetor(1), index: 0 }] })),
      capturado,
    );
    const cliente = criarClienteVoyage({ chave: "chave-teste", fetch: fetchF });
    const r = await cliente.gerar(["primeiro", "segundo"], "document");
    expect(r[0][0]).toBe(1);
    expect(r[1][0]).toBe(2);
    expect(capturado.url).toBe(URL_VOYAGE);
    expect((capturado.init?.headers as Record<string, string>).Authorization).toBe("Bearer chave-teste");
    expect(JSON.parse(String(capturado.init?.body))).toEqual({ input: ["primeiro", "segundo"], model: MODELO_PADRAO, input_type: "document" });
  });

  it("usa o modelo configurado quando informado", async () => {
    const capturado: { url?: string; init?: RequestInit } = {};
    const fetchF = fetchFalso(() => new Response(JSON.stringify({ data: [{ embedding: vetor(0), index: 0 }] })), capturado);
    await criarClienteVoyage({ chave: "x", modelo: "voyage-3", fetch: fetchF }).gerar(["um"], "query");
    expect(JSON.parse(String(capturado.init?.body)).model).toBe("voyage-3");
  });

  it("lista vazia não chama a API", async () => {
    const fetchF = (async () => {
      throw new Error("não deveria chamar");
    }) as unknown as typeof fetch;
    expect(await criarClienteVoyage({ chave: "x", fetch: fetchF }).gerar([], "document")).toEqual([]);
  });

  it("recusa resposta de erro, quantidade diferente e dimensão errada", async () => {
    const erro = criarClienteVoyage({ chave: "x", fetch: fetchFalso(new Response("", { status: 429 })) });
    await expect(erro.gerar(["um"], "document")).rejects.toThrow(ErroEmbeddings);
    await expect(erro.gerar(["um"], "document")).rejects.toThrow(/429/);

    const sem = criarClienteVoyage({ chave: "x", fetch: fetchFalso(new Response(JSON.stringify({}))) });
    await expect(sem.gerar(["um"], "document")).rejects.toThrow(/menos embeddings/);

    const curto = criarClienteVoyage({ chave: "x", fetch: fetchFalso(new Response(JSON.stringify({ data: [{ embedding: [1, 2], index: 0 }] }))) });
    await expect(curto.gerar(["um"], "document")).rejects.toThrow(/Dimensão 2/);
  });
});

describe("falso determinístico e formato do vetor", () => {
  it("mesmo texto, mesmo vetor; textos diferentes, vetores diferentes; dimensão correta", async () => {
    const f = criarClienteEmbeddingsFalso();
    const [a, b, c] = await f.gerar(["texto", "texto", "outro"], "document");
    expect(a).toHaveLength(DIMENSOES);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("comoVetorSql monta o formato aceito pelo pgvector", () => {
    expect(comoVetorSql([1, 2.5, -3])).toBe("[1,2.5,-3]");
  });
});
