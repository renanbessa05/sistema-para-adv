import { describe, expect, it } from "vitest";
import { dividirEmChunks } from "../chunks";

describe("divisão em trechos", () => {
  it("texto vazio não gera trecho", () => {
    expect(dividirEmChunks("   \n\n  ")).toEqual([]);
  });

  it("parágrafos curtos se juntam até o alvo", () => {
    expect(dividirEmChunks("Um.\n\nDois.")).toEqual(["Um. Dois."]);
  });

  it("parágrafos que passam do alvo começam trecho novo", () => {
    expect(dividirEmChunks("Primeiro parágrafo com texto.\n\nSegundo parágrafo com texto.", 40)).toEqual(["Primeiro parágrafo com texto.", "Segundo parágrafo com texto."]);
  });

  it("parágrafo longo corta no ponto final dentro do limite e não perde texto", () => {
    const original = "Primeira frase do acórdão aqui. Segunda frase bem mais longa do que o limite permite. Terceira.";
    const trechos = dividirEmChunks(original, 50);
    expect(trechos.every((t) => t.length <= 50)).toBe(true);
    expect(trechos.join(" ")).toBe(original);
  });

  it("sem ponto final, corta no próprio limite", () => {
    const trechos = dividirEmChunks("abcdefghij".repeat(15), 50);
    expect(trechos.map((t) => t.length)).toEqual([50, 50, 50]);
    expect(trechos.join("")).toBe("abcdefghij".repeat(15));
  });
});
