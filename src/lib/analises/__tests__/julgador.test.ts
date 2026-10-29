import { describe, expect, it } from "vitest";
import { AVISO_PREVISAO, faseValida, garantirAviso, montarRelatorioJulgador } from "../julgador";

describe("garantirAviso", () => {
  it("acrescenta o aviso fixo quando a minuta não o traz", () => {
    const r = garantirAviso("Sentença de teste.\n\n");
    expect(r.endsWith(AVISO_PREVISAO)).toBe(true);
    expect(r).toContain("Sentença de teste.");
    expect(r).toContain("minuta de previsão judicial para estudo do caso");
  });

  it("não duplica o aviso quando a IA já o escreveu", () => {
    const comAviso = `Texto.\n\n> ${AVISO_PREVISAO}`;
    expect(garantirAviso(comAviso)).toBe(comAviso);
  });

  it("reconhece o aviso sem negrito e com caixa alta", () => {
    const sem = "Texto.\n\nMINUTA DE PREVISÃO JUDICIAL PARA ESTUDO DO CASO. Não é decisão oficial e não substitui nada.";
    expect(garantirAviso(sem)).toBe(sem);
  });

  it("minuta vazia continua vazia", () => {
    expect(garantirAviso("   \n ")).toBe("");
  });
});

describe("montarRelatorioJulgador", () => {
  it("monta mapa e minuta na ordem da skill, com o rótulo da fase", () => {
    const r = montarRelatorioJulgador({ mapaMd: "## 5.1\nidentificação", minutaMd: "SENTENÇA", fase: "sentenca" });
    expect(r.indexOf("PARTE I")).toBeLessThan(r.indexOf("PARTE II"));
    expect(r).toContain("Sentença (art. 355, I, do CPC)");
    expect(r).toContain("minuta de previsão judicial");
  });

  it("sem minuta, explica em vez de inventar pronunciamento", () => {
    const r = montarRelatorioJulgador({ mapaMd: "mapa", minutaMd: "  ", fase: "sem_pronunciamento" });
    expect(r).toContain("Sem minuta");
    expect(r).not.toContain("minuta de previsão judicial");
  });
});

describe("faseValida", () => {
  it("aceita só as fases conhecidas", () => {
    expect(faseValida("acordao")).toBe(true);
    expect(faseValida("liminar")).toBe(false);
    expect(faseValida(3)).toBe(false);
  });
});
