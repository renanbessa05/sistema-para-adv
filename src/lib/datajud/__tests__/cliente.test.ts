import { describe, expect, it, vi } from "vitest";
import { ErroDatajud, criarClienteDatajud } from "../cliente";
import processoTjmt from "../mocks/processo-tjmt.json";
import processoSigiloso from "../mocks/processo-sigiloso.json";

function criarRelogio() {
  let t = 1_700_000_000_000;
  const esperas: number[] = [];
  return {
    agora: () => t,
    sleep: async (ms: number) => {
      esperas.push(ms);
      t += ms;
    },
    avancar: (ms: number) => {
      t += ms;
    },
    esperas,
  };
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

describe("criarClienteDatajud", () => {
  it("exige chave", () => {
    expect(() => criarClienteDatajud({ apiKey: "" })).toThrow(ErroDatajud);
  });

  it("envia POST ao alias com header Authorization APIKey e query match por numeroProcesso", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(processoTjmt));
    const cliente = criarClienteDatajud({ baseUrl: "https://datajud.teste/", apiKey: "chave-publica", fetchImpl, sleep: async () => {} });

    const processos = await cliente.buscarPorNumero("1004521-88.2025.8.11.0041");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://datajud.teste/api_publica_tjmt/_search");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("APIKey chave-publica");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ size: 10, query: { match: { numeroProcesso: "10045218820258110041" } } });

    expect(processos).not.toBeNull();
    expect(processos).toHaveLength(1);
    expect(processos![0].numero_cnj).toBe("10045218820258110041");
    expect(processos![0].grau).toBe("G1");
    expect(processos![0].comarca).toBe("Cuiabá");
    expect(processos![0].ultimo_movimento?.codigo).toBe(92);
  });

  it("aceita outro alias de tribunal", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(processoSigiloso));
    const cliente = criarClienteDatajud({ apiKey: "k", fetchImpl, sleep: async () => {} });
    await cliente.buscarPorNumero("10045218820258110041", { tribunalAlias: "api_publica_tjsp" });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api-publica.datajud.cnj.jus.br/api_publica_tjsp/_search");
  });

  it("devolve null quando hits está vazio (processo sigiloso ou não enviado)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(processoSigiloso));
    const cliente = criarClienteDatajud({ apiKey: "k", fetchImpl, sleep: async () => {} });
    expect(await cliente.buscarPorNumero("00032104520268110041")).toBeNull();
  });

  it("rejeita número sem 20 dígitos antes de chamar a rede", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const cliente = criarClienteDatajud({ apiKey: "k", fetchImpl, sleep: async () => {} });
    await expect(cliente.buscarPorNumero("123")).rejects.toThrow(/20 dígitos/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("401/403 lança erro de chave inválida sem retentativa", async () => {
    for (const status of [401, 403]) {
      const fetchImpl = vi.fn<typeof fetch>(async () => new Response("Unauthorized", { status }));
      const cliente = criarClienteDatajud({ apiKey: "k", fetchImpl, sleep: async () => {} });
      const erro = await cliente.buscarPorNumero("10045218820258110041").catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ErroDatajud);
      expect((erro as ErroDatajud).status).toBe(status);
      expect((erro as ErroDatajud).chaveInvalida).toBe(true);
      expect((erro as ErroDatajud).message).toMatch(/chave da API inválida ou trocada pelo CNJ/);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("429 espera 60 s e repete; 5xx tenta 3 vezes", async () => {
    const relogio = criarRelogio();
    const respostas = [429, 500, 200];
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      const status = respostas.shift() ?? 200;
      return status === 200 ? json(processoTjmt) : new Response("erro", { status });
    });
    const cliente = criarClienteDatajud({ apiKey: "k", fetchImpl, sleep: relogio.sleep, agora: relogio.agora });
    const processos = await cliente.buscarPorNumero("10045218820258110041");
    expect(processos).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(relogio.esperas).toEqual([60_000, 1_000]);

    const sempre503 = vi.fn<typeof fetch>(async () => new Response("Service Unavailable", { status: 503 }));
    const cliente2 = criarClienteDatajud({ apiKey: "k", fetchImpl: sempre503, sleep: relogio.sleep, agora: relogio.agora });
    const erro = await cliente2.buscarPorNumero("10045218820258110041").catch((e: unknown) => e);
    expect((erro as ErroDatajud).status).toBe(503);
    expect((erro as ErroDatajud).corpo).toBe("Service Unavailable");
    expect(sempre503).toHaveBeenCalledTimes(3);
  });

  it("respeita o ritmo por minuto com sleep injetado", async () => {
    const relogio = criarRelogio();
    const fetchImpl = vi.fn<typeof fetch>(async () => json(processoSigiloso));
    const cliente = criarClienteDatajud({ apiKey: "k", fetchImpl, sleep: relogio.sleep, agora: relogio.agora, maxRequisicoesPorMinuto: 3 });

    const resultados = await cliente.buscarVarios([
      "10045218820258110041",
      "10123455520248110002",
      "10007777320238110003",
      "00032104520268110041",
    ]);
    expect(resultados).toHaveLength(4);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    // A quarta requisição só sai depois que a primeira completa 60 s na janela.
    expect(relogio.esperas).toEqual([60_000]);
  });

  it("buscarVarios deduplica números, continua após erro comum e aborta em chave inválida", async () => {
    const relogio = criarRelogio();
    let chamadas = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      chamadas += 1;
      if (chamadas === 2) return new Response("{\"error\":\"parse\"}", { status: 400 });
      return json(processoTjmt);
    });
    const cliente = criarClienteDatajud({ apiKey: "k", fetchImpl, sleep: relogio.sleep, agora: relogio.agora });
    const resultados = await cliente.buscarVarios(["10045218820258110041", "1004521-88.2025.8.11.0041", "10123455520248110002"]);
    expect(resultados).toHaveLength(2);
    expect(resultados[0].processos).toHaveLength(1);
    expect(resultados[1].processos).toBeNull();
    expect(resultados[1].erro).toMatch(/400/);

    const fetch403 = vi.fn<typeof fetch>(async () => new Response("", { status: 403 }));
    const cliente2 = criarClienteDatajud({ apiKey: "k", fetchImpl: fetch403, sleep: relogio.sleep, agora: relogio.agora });
    await expect(cliente2.buscarVarios(["10045218820258110041", "10123455520248110002"])).rejects.toMatchObject({ chaveInvalida: true });
    expect(fetch403).toHaveBeenCalledTimes(1);
  });

  it("lança ErroDatajud quando a resposta não é um envelope Elasticsearch", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ resultado: [] }));
    const cliente = criarClienteDatajud({ apiKey: "k", fetchImpl, sleep: async () => {} });
    await expect(cliente.buscarPorNumero("10045218820258110041")).rejects.toThrow(/fora do formato Elasticsearch/);
  });
});
