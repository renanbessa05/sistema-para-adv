import { describe, expect, it } from "vitest";
import { hashDedup, normalizarTextoParaHash } from "../hash";
import pagina1 from "../mocks/comunicacao-pagina1.json";
import { normalizarPublicacaoDjen } from "../normalizar";
import { RespostaDjenSchema } from "../tipos";

const itens = RespostaDjenSchema.parse(pagina1).items;

describe("hashDedup", () => {
  it("é sha256 hex determinístico", () => {
    const p = normalizarPublicacaoDjen(itens[0]);
    const h1 = hashDedup(p);
    const h2 = hashDedup(normalizarPublicacaoDjen(itens[0]));
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h2);
  });

  it("ignora id, hash do DJEN, caixa e espaços duplicados (republicação com id novo)", () => {
    const original = normalizarPublicacaoDjen(itens[0]);
    const republicada = normalizarPublicacaoDjen({
      ...itens[0],
      id: 999999999,
      hash: "outro-hash",
      texto: itens[0].texto!.replace(/<p>/g, "<p>   ").replace("Vistos", "VISTOS").replace("Intime-se", "INTIME-SE"),
    });
    expect(republicada.id_externo).not.toBe(original.id_externo);
    expect(hashDedup(republicada)).toBe(hashDedup(original));
  });

  it("muda quando muda tribunal, processo, data ou texto", () => {
    const p = normalizarPublicacaoDjen(itens[0]);
    const base = hashDedup(p);
    expect(hashDedup({ ...p, tribunal_sigla: "TJSP" })).not.toBe(base);
    expect(hashDedup({ ...p, numero_cnj: "00000000000000000000" })).not.toBe(base);
    expect(hashDedup({ ...p, data_disponibilizacao: "2026-10-28" })).not.toBe(base);
    expect(hashDedup({ ...p, texto: p.texto + " x" })).not.toBe(base);
  });

  it("usa numero_processo_texto quando não há CNJ e tolera nulls", () => {
    const a = hashDedup({ tribunal_sigla: "TJMT", numero_cnj: null, numero_processo_texto: "ABC", data_disponibilizacao: "2026-01-01", texto: "t" });
    const b = hashDedup({ tribunal_sigla: "TJMT", numero_cnj: null, numero_processo_texto: "ABD", data_disponibilizacao: "2026-01-01", texto: "t" });
    expect(a).not.toBe(b);
    expect(() => hashDedup({ tribunal_sigla: null, numero_cnj: null, numero_processo_texto: null, data_disponibilizacao: null, texto: "" })).not.toThrow();
  });

  it("normalizarTextoParaHash", () => {
    expect(normalizarTextoParaHash("  Olá   MUNDO \n novo ")).toBe("olá mundo novo");
    expect(normalizarTextoParaHash(null)).toBe("");
  });
});
