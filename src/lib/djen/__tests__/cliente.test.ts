import { describe, expect, it, vi } from "vitest";
import { ErroDjen, criarClienteDjen } from "../cliente";
import pagina1 from "../mocks/comunicacao-pagina1.json";
import pagina2 from "../mocks/comunicacao-pagina2.json";

/** Relógio falso: `sleep` avança o tempo em vez de esperar. */
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

function json(corpo: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(corpo), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

function pagina(count: number, quantidade: number, inicioId: number) {
  const items = Array.from({ length: quantidade }, (_, i) => ({
    id: inicioId + i,
    hash: `h${inicioId + i}`,
    siglaTribunal: "TJMT",
  }));
  return { status: "success", message: "ok", count, items };
}

describe("criarClienteDjen", () => {
  it("exige ao menos um filtro entre os obrigatórios", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const cliente = criarClienteDjen({ fetchImpl, sleep: async () => {} });
    await expect(cliente.consultar({ dataDisponibilizacaoInicio: "2026-10-01" })).rejects.toBeInstanceOf(ErroDjen);
    await expect(cliente.consultar({ ufOab: "MT" })).rejects.toThrow(/ao menos um filtro/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("monta a URL com os parâmetros do Swagger e valida a resposta", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(pagina1, { headers: { "x-ratelimit-limit": "20", "x-ratelimit-remaining": "17" } }));
    const cliente = criarClienteDjen({ baseUrl: "https://djen.teste/", fetchImpl, sleep: async () => {} });

    const resposta = await cliente.consultar({
      numeroOab: 12345,
      ufOab: "mt",
      siglaTribunal: "tjmt",
      dataDisponibilizacaoInicio: "2026-10-01",
      dataDisponibilizacaoFim: "2026-10-28",
      numeroProcesso: "1004521-88.2025.8.11.0041",
    });

    expect(resposta.items).toHaveLength(3);
    expect(resposta.count).toBe(5);
    expect(resposta.items[0].id).toBe(418233001);

    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe("https://djen.teste/api/v1/comunicacao");
    expect(url.searchParams.get("numeroOab")).toBe("12345");
    expect(url.searchParams.get("ufOab")).toBe("MT");
    expect(url.searchParams.get("siglaTribunal")).toBe("TJMT");
    expect(url.searchParams.get("numeroProcesso")).toBe("10045218820258110041");
    expect(url.searchParams.get("itensPorPagina")).toBe("100");
    expect(url.searchParams.get("pagina")).toBe("1");

    expect(cliente.ultimoRateLimit).toMatchObject({ limite: 20, restante: 17 });
  });

  it("rejeita itensPorPagina fora de {5, 100} e datas fora de YYYY-MM-DD", async () => {
    const cliente = criarClienteDjen({ fetchImpl: vi.fn<typeof fetch>(), sleep: async () => {} });
    await expect(
      cliente.consultar({ siglaTribunal: "TJMT", itensPorPagina: 50 as unknown as 5 }),
    ).rejects.toThrow(/5 ou 100/);
    await expect(
      cliente.consultar({ siglaTribunal: "TJMT", dataDisponibilizacaoInicio: "28/10/2026" }),
    ).rejects.toThrow(/YYYY-MM-DD/);
  });

  it("consultarTodas pagina até esgotar o count", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (entrada) => {
      const url = String(entrada);
      const p = new URL(url).searchParams.get("pagina");
      return json(p === "1" ? pagina1 : pagina2);
    });
    // Páginas de 5 itens: o mock tem count 5 e páginas de 3 + 2.
    const cliente = criarClienteDjen({ fetchImpl, sleep: async () => {} });
    const resultado = await cliente.consultarTodas({ numeroOab: "12345", ufOab: "MT", itensPorPagina: 5 });

    expect(resultado.items.map((i) => i.id)).toEqual([418233001, 418233002, 418233003, 418233004, 418233005]);
    expect(resultado.count).toBe(5);
    expect(resultado.paginas).toBe(2);
    expect(resultado.truncado).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("consultarTodas para na página incompleta quando a API não informa count", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (entrada) => {
      const url = String(entrada);
      const p = Number(new URL(url).searchParams.get("pagina"));
      const corpo: Record<string, unknown> = p === 1 ? pagina(250, 100, 1) : pagina(250, 40, 101);
      delete corpo.count;
      return json(corpo);
    });
    const cliente = criarClienteDjen({ fetchImpl, sleep: async () => {} });
    const resultado = await cliente.consultarTodas({ siglaTribunal: "TJMT" });
    expect(resultado.items).toHaveLength(140);
    expect(resultado.paginas).toBe(2);
  });

  it("consultarTodas respeita maxItens e marca truncado", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (entrada) => {
      const url = String(entrada);
      const p = Number(new URL(url).searchParams.get("pagina"));
      return json(pagina(1000, 100, (p - 1) * 100 + 1));
    });
    const cliente = criarClienteDjen({ fetchImpl, sleep: async () => {} });
    const resultado = await cliente.consultarTodas({ siglaTribunal: "TJMT" }, { maxItens: 250 });
    expect(resultado.items).toHaveLength(250);
    expect(resultado.truncado).toBe(true);
    expect(resultado.paginas).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("em 429 espera 60 s e repete; desiste após 3 repetições", async () => {
    const relogio = criarRelogio();
    const respostas = [429, 429, 200];
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      const status = respostas.shift() ?? 200;
      return status === 200 ? json(pagina1) : json({ message: "Too Many Requests" }, { status: 429 });
    });
    const cliente = criarClienteDjen({ fetchImpl, sleep: relogio.sleep, agora: relogio.agora });

    const resposta = await cliente.consultar({ siglaTribunal: "TJMT" });
    expect(resposta.items).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(relogio.esperas.filter((ms) => ms === 60_000)).toHaveLength(2);

    const sempre429 = vi.fn<typeof fetch>(async () => json({ message: "Too Many Requests" }, { status: 429 }));
    const cliente2 = criarClienteDjen({ fetchImpl: sempre429, sleep: relogio.sleep, agora: relogio.agora });
    const erro = await cliente2.consultar({ siglaTribunal: "TJMT" }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDjen);
    expect((erro as ErroDjen).status).toBe(429);
    expect((erro as ErroDjen).corpo).toContain("Too Many Requests");
    // 1 tentativa inicial + 3 repetições.
    expect(sempre429).toHaveBeenCalledTimes(4);
  });

  it("em 5xx tenta 3 vezes com espera exponencial e então lança ErroDjen com status e corpo", async () => {
    const relogio = criarRelogio();
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("Bad Gateway", { status: 502 }));
    const cliente = criarClienteDjen({ fetchImpl, sleep: relogio.sleep, agora: relogio.agora });

    const erro = await cliente.consultar({ siglaTribunal: "TJMT" }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDjen);
    expect((erro as ErroDjen).status).toBe(502);
    expect((erro as ErroDjen).corpo).toBe("Bad Gateway");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(relogio.esperas).toEqual([1_000, 2_000]);
  });

  it("recupera de um 5xx isolado", async () => {
    const relogio = criarRelogio();
    const respostas = [503, 200];
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      const status = respostas.shift() ?? 200;
      return status === 200 ? json(pagina2) : new Response("erro", { status });
    });
    const cliente = criarClienteDjen({ fetchImpl, sleep: relogio.sleep, agora: relogio.agora });
    const resposta = await cliente.consultar({ siglaTribunal: "TJMT" });
    expect(resposta.items).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("erro 4xx que não é 429 lança sem retentativa", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{\"message\":\"parâmetro inválido\"}", { status: 400 }));
    const cliente = criarClienteDjen({ fetchImpl, sleep: async () => {} });
    const erro = await cliente.consultar({ siglaTribunal: "TJMT" }).catch((e: unknown) => e);
    expect((erro as ErroDjen).status).toBe(400);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("respeita o ritmo de N requisições por minuto usando sleep", async () => {
    const relogio = criarRelogio();
    const fetchImpl = vi.fn<typeof fetch>(async () => json(pagina(0, 0, 1)));
    const cliente = criarClienteDjen({
      fetchImpl,
      sleep: relogio.sleep,
      agora: relogio.agora,
      maxRequisicoesPorMinuto: 2,
    });

    await cliente.consultar({ siglaTribunal: "TJMT" });
    relogio.avancar(10_000);
    await cliente.consultar({ siglaTribunal: "TJMT" });
    expect(relogio.esperas).toEqual([]);

    // Terceira requisição dentro da mesma janela: precisa esperar até a primeira sair da janela (60 s - 10 s).
    await cliente.consultar({ siglaTribunal: "TJMT" });
    expect(relogio.esperas).toEqual([50_000]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    // Depois de mais de um minuto, não espera.
    relogio.avancar(61_000);
    await cliente.consultar({ siglaTribunal: "TJMT" });
    expect(relogio.esperas).toEqual([50_000]);
  });

  it("lança ErroDjen quando o envelope não tem items", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ status: "success", data: [] }));
    const cliente = criarClienteDjen({ fetchImpl, sleep: async () => {} });
    await expect(cliente.consultar({ siglaTribunal: "TJMT" })).rejects.toThrow(/fora do formato esperado/);
  });

  it("certidaoUrl e tribunais", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json([{ sigla: "TJMT", nome: "Tribunal de Justiça de Mato Grosso" }]));
    const cliente = criarClienteDjen({ baseUrl: "https://comunicaapi.pje.jus.br", fetchImpl, sleep: async () => {} });
    expect(cliente.certidaoUrl("abc123")).toBe("https://comunicaapi.pje.jus.br/api/v1/comunicacao/abc123/certidao");
    const tribunais = await cliente.tribunais();
    expect(tribunais[0].sigla).toBe("TJMT");
    expect(fetchImpl.mock.calls[0][0]).toBe("https://comunicaapi.pje.jus.br/api/v1/comunicacao/tribunal");
  });
});
