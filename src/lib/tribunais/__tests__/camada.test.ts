import { describe, expect, it } from "vitest";
import { montarCamadaLocal } from "../camada";

const seed = [
  { bloco: 2, bloco_titulo: "Endereçamento", item: "Grafia da comarca no cabeçalho" },
  { bloco: 1, bloco_titulo: "Sistema eletrônico", item: "Sistema usado naquele grau" },
];

describe("camada local montada para o agente", () => {
  it("sem confirmação, todo item do seed é a verificar; ordena por bloco", () => {
    const camada = montarCamadaLocal(seed, []);
    expect(camada.map((c) => c.bloco)).toEqual([1, 2]);
    expect(camada.every((c) => c.situacao === "a_verificar" && c.fonte === null)).toBe(true);
  });

  it("confirmação com fonte torna o item confirmado", () => {
    const camada = montarCamadaLocal(seed, [{ bloco: 1, item: "Sistema usado naquele grau", fonte: "Página do TJ, aba de processos" }]);
    expect(camada[0]).toMatchObject({ situacao: "confirmado", fonte: "Página do TJ, aba de processos" });
    expect(camada[1].situacao).toBe("a_verificar");
  });

  it("confirmação de item fora do seed entra como item próprio do escritório", () => {
    const camada = montarCamadaLocal(seed, [{ bloco: 3, item: "Tabela de custas do ano", fonte: "Tabela publicada no DJe" }]);
    expect(camada.at(-1)).toMatchObject({ bloco: 3, bloco_titulo: "Confirmação do escritório", situacao: "confirmado" });
  });
});
