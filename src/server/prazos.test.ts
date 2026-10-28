import { describe, expect, it } from "vitest";
import { casarAto, type AtoPrazo } from "./prazos";

const atos: AtoPrazo[] = [
  { id: "1", nome: "Contestação", sinonimos: ["contestar", "defesa"], dias: 15, contagem: "dias_uteis", dobro_padrao: false, dias_seguranca: 2, fundamento_legal: "CPC 335" },
  { id: "2", nome: "Embargos de declaração", sinonimos: ["embargos declaratórios", "aclaratórios"], dias: 5, contagem: "dias_uteis", dobro_padrao: false, dias_seguranca: 1, fundamento_legal: "CPC 1.023" },
  { id: "3", nome: "Réplica", sinonimos: ["impugnação à contestação", "replicar"], dias: 15, contagem: "dias_uteis", dobro_padrao: false, dias_seguranca: 2, fundamento_legal: null },
];

describe("casarAto", () => {
  it("casa por nome, sinônimo e sem acento", () => {
    expect(casarAto("apresentar contestação", atos)?.id).toBe("1");
    expect(casarAto("contestar", atos)?.id).toBe("1");
    expect(casarAto("opor embargos declaratorios", atos)?.id).toBe("2");
    expect(casarAto("Replicar", atos)?.id).toBe("3");
  });
  it("devolve null quando nada casa ou sem sugestão", () => {
    expect(casarAto("pagar custas", atos)).toBeNull();
    expect(casarAto(null, atos)).toBeNull();
  });
});
