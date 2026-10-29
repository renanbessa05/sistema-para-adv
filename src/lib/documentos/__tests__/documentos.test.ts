import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extrairPaginas, inventariar, limparTexto, montarTrecho } from "../pdf";
import { cabeNaApi, extensaoDoMime, mimeAceito, nomeSeguro } from "../limites";
import { sha256Hex } from "../hash";

const fixture = path.resolve(__dirname, "../../../../tests/fixtures/documentos/autos-sintetico-12p.pdf");

describe("limites e nomes", () => {
  it("decide se o PDF cabe na API pelos limites", () => {
    expect(cabeNaApi(5 * 1024 * 1024, 100)).toBe(true);
    expect(cabeNaApi(25 * 1024 * 1024, 100)).toBe(false);
    expect(cabeNaApi(1024, 301)).toBe(false);
    expect(cabeNaApi(1024, null)).toBe(true);
    expect(cabeNaApi(1024, 10, { maxMb: 1, maxPaginas: 5 })).toBe(false);
  });

  it("aceita só os mimes previstos e dá a extensão", () => {
    expect(mimeAceito("application/pdf")).toBe(true);
    expect(mimeAceito("application/x-msdownload")).toBe(false);
    expect(extensaoDoMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("docx");
    expect(extensaoDoMime("image/gif")).toBeNull();
  });

  it("limpa o nome do arquivo", () => {
    expect(nomeSeguro("..\\..\\..\\autos:final?.pdf")).toBe("autosfinal.pdf");
    expect(nomeSeguro("")).toBe("arquivo");
    expect(nomeSeguro("a".repeat(200) + ".pdf")).toHaveLength(120);
  });

  it("hash sha-256 estável", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(new Uint8Array([97, 98, 99]))).toBe(sha256Hex("abc"));
  });
});

describe("texto e inventário", () => {
  it("normaliza hifenização e espaços", () => {
    expect(limparTexto("contes-\ntação  no  prazo\n\n\n\nlegal  \n")).toBe("contestação no prazo\n\nlegal");
  });

  it("inventaria cabeçalhos de peças e monta trechos por página", () => {
    const paginas = [
      { numero: 1, texto: "EXCELENTÍSSIMO SENHOR DOUTOR JUIZ\nPetição inicial" },
      { numero: 2, texto: "continuação dos fatos" },
      { numero: 3, texto: "SENTENÇA\nVistos." },
      { numero: 4, texto: "Num. 123456789 - Pág. 1\nCertidão" },
    ];
    expect(inventariar(paginas).map((i) => i.pagina)).toEqual([1, 3, 4]);
    const trecho = montarTrecho(paginas, 2, 3);
    expect(trecho).toContain("--- página 2 ---");
    expect(trecho).toContain("SENTENÇA");
    expect(trecho).not.toContain("Petição inicial");
    expect(montarTrecho(paginas, 1, 4, 40)).toContain("[trecho truncado");
  });
});

describe("extração de PDF (fixture sintética)", () => {
  it("extrai o texto página a página do PDF gerado por scripts/gerar-pdf-sintetico.ts", async () => {
    const bytes = new Uint8Array(readFileSync(fixture));
    const r = await extrairPaginas(bytes);
    expect(r.totalPaginas).toBe(12);
    expect(r.paginas).toHaveLength(12);
    expect(r.semTexto).toBe(false);
    expect(r.paginas[0].texto).toMatch(/EXCELENT[IÍ]SSIMO/);
    expect(r.paginas[11].texto).toMatch(/página 12/i);
    const inv = inventariar(r.paginas);
    expect(inv.length).toBeGreaterThanOrEqual(2);
  }, 60_000);
});
