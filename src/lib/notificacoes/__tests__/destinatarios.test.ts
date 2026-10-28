import { describe, expect, it } from "vitest";
import { estaAusente, resolverDestinatario, sociosDisponiveis } from "../destinatarios";
import type { Ausencia, Membro } from "../tipos";

const membro = (id: string, papel: Membro["papel"], extra: Partial<Membro> = {}): Membro => ({
  id,
  nome: id.toUpperCase(),
  papel,
  ativo: true,
  telefoneVerificado: true,
  emailVerificado: true,
  ...extra,
});

const MEMBROS: Membro[] = [
  membro("socia", "socio"),
  membro("socio2", "socio"),
  membro("adv", "advogado"),
  membro("adv2", "advogado"),
  membro("est", "estagiario"),
  membro("inativo", "advogado", { ativo: false }),
];

describe("resolverDestinatario", () => {
  it("usuário presente recebe diretamente", () => {
    expect(resolverDestinatario("adv", "2026-10-28", [], MEMBROS)).toEqual([{ usuarioId: "adv", motivo: "direto" }]);
  });

  it("ausente com substituto → substituto, com motivo ausencia", () => {
    const ausencias: Ausencia[] = [{ usuarioId: "adv", inicio: "2026-10-20", fim: "2026-10-30", substitutoId: "adv2" }];
    expect(resolverDestinatario("adv", "2026-10-28", ausencias, MEMBROS)).toEqual([
      { usuarioId: "adv2", motivo: "ausencia", substituiA: "adv" },
    ]);
    // fora do período volta ao normal; aceita ISO completo
    expect(resolverDestinatario("adv", "2026-10-31T10:00:00", ausencias, MEMBROS)).toEqual([{ usuarioId: "adv", motivo: "direto" }]);
  });

  it("limites da ausência são inclusivos", () => {
    const ausencias: Ausencia[] = [{ usuarioId: "adv", inicio: "2026-10-28", fim: "2026-10-28", substitutoId: "adv2" }];
    expect(estaAusente("adv", "2026-10-28", ausencias)).toBeDefined();
    expect(estaAusente("adv", "2026-10-27", ausencias)).toBeUndefined();
    expect(estaAusente("adv", "2026-10-29", ausencias)).toBeUndefined();
  });

  it("ausente sem substituto → sócios ativos e presentes", () => {
    const ausencias: Ausencia[] = [{ usuarioId: "adv", inicio: "2026-10-20", fim: "2026-10-30" }];
    expect(resolverDestinatario("adv", "2026-10-28", ausencias, MEMBROS)).toEqual([
      { usuarioId: "socia", motivo: "ausencia_sem_substituto", substituiA: "adv" },
      { usuarioId: "socio2", motivo: "ausencia_sem_substituto", substituiA: "adv" },
    ]);
  });

  it("substituto também ausente → sócios, sem seguir a cadeia (evita laço)", () => {
    const ausencias: Ausencia[] = [
      { usuarioId: "adv", inicio: "2026-10-20", fim: "2026-10-30", substitutoId: "adv2" },
      { usuarioId: "adv2", inicio: "2026-10-25", fim: "2026-10-29", substitutoId: "adv" },
      { usuarioId: "socio2", inicio: "2026-10-28", fim: "2026-10-28" },
    ];
    expect(resolverDestinatario("adv", "2026-10-28", ausencias, MEMBROS)).toEqual([
      { usuarioId: "socia", motivo: "ausencia_sem_substituto", substituiA: "adv" },
    ]);
  });

  it("substituto inativo ou igual ao próprio usuário é ignorado", () => {
    expect(
      resolverDestinatario("adv", "2026-10-28", [{ usuarioId: "adv", inicio: "2026-10-01", fim: "2026-10-31", substitutoId: "inativo" }], MEMBROS),
    ).toEqual([
      { usuarioId: "socia", motivo: "ausencia_sem_substituto", substituiA: "adv" },
      { usuarioId: "socio2", motivo: "ausencia_sem_substituto", substituiA: "adv" },
    ]);
    expect(
      resolverDestinatario("adv", "2026-10-28", [{ usuarioId: "adv", inicio: "2026-10-01", fim: "2026-10-31", substitutoId: "adv" }], MEMBROS).map(
        (r) => r.usuarioId,
      ),
    ).toEqual(["socia", "socio2"]);
  });

  it("usuário inativo → sócios com motivo inativo", () => {
    expect(resolverDestinatario("inativo", "2026-10-28", [], MEMBROS)).toEqual([
      { usuarioId: "socia", motivo: "inativo", substituiA: "inativo" },
      { usuarioId: "socio2", motivo: "inativo", substituiA: "inativo" },
    ]);
  });

  it("sócio ausente sem substituto vai para os outros sócios, nunca para si", () => {
    const ausencias: Ausencia[] = [{ usuarioId: "socia", inicio: "2026-10-20", fim: "2026-10-30" }];
    expect(resolverDestinatario("socia", "2026-10-28", ausencias, MEMBROS)).toEqual([
      { usuarioId: "socio2", motivo: "ausencia_sem_substituto", substituiA: "socia" },
    ]);
  });

  it("sem nenhum sócio disponível, devolve o próprio usuário para não perder a notificação", () => {
    const soAdv = MEMBROS.filter((m) => m.papel !== "socio");
    expect(resolverDestinatario("adv", "2026-10-28", [{ usuarioId: "adv", inicio: "2026-10-01", fim: "2026-10-31" }], soAdv)).toEqual([
      { usuarioId: "adv", motivo: "direto" },
    ]);
  });

  it("sociosDisponiveis exclui ids e ausentes", () => {
    expect(sociosDisponiveis("2026-10-28", [], MEMBROS, ["socia"]).map((m) => m.id)).toEqual(["socio2"]);
  });
});
