import { describe, expect, it } from "vitest";
import {
  acessoSuporteVigente,
  avaliarLimite,
  escolherTeto,
  validarMotivoAcesso,
  validarValidadeAcesso,
} from "./limites";

const agora = new Date("2026-10-29T12:00:00Z");
const dia = 24 * 60 * 60 * 1000;

describe("avaliarLimite", () => {
  it("sem limite configurado nunca bloqueia", () => {
    expect(avaliarLimite(10_000, null)).toEqual({ permitido: true, restante: null });
    expect(avaliarLimite(10_000, undefined)).toEqual({ permitido: true, restante: null });
  });
  it("bloqueia quando o atual alcança o limite", () => {
    expect(avaliarLimite(4, 5)).toEqual({ permitido: true, restante: 1 });
    expect(avaliarLimite(5, 5)).toEqual({ permitido: false, restante: 0 });
    expect(avaliarLimite(7, 5)).toEqual({ permitido: false, restante: 0 });
  });
  it("limite zero bloqueia tudo", () => {
    expect(avaliarLimite(0, 0)).toEqual({ permitido: false, restante: 0 });
  });
});

describe("escolherTeto", () => {
  it("configuração do escritório tem precedência", () => {
    expect(escolherTeto({ configuracao: 10, override: 99, padrao: 50 })).toBe(10);
  });
  it("sem configuração, usa o override de escritorio_limites", () => {
    expect(escolherTeto({ configuracao: null, override: 99, padrao: 50 })).toBe(99);
    expect(escolherTeto({ configuracao: undefined, override: 99, padrao: 50 })).toBe(99);
  });
  it("sem nada, cai no padrão do ambiente (comportamento anterior)", () => {
    expect(escolherTeto({ configuracao: null, override: null, padrao: 50 })).toBe(50);
  });
  it("converte valores vindos como texto do banco", () => {
    expect(escolherTeto({ configuracao: "12.5" as unknown as number, override: null, padrao: 50 })).toBe(12.5);
  });
});

describe("acessoSuporteVigente", () => {
  it("vigente quando não revogado e dentro da validade", () => {
    expect(acessoSuporteVigente({ expiraEm: new Date(agora.getTime() + dia), revogadoEm: null }, agora)).toBe(true);
  });
  it("vencido deixa de valer", () => {
    expect(acessoSuporteVigente({ expiraEm: new Date(agora.getTime() - 1), revogadoEm: null }, agora)).toBe(false);
  });
  it("revogado deixa de valer mesmo dentro da validade", () => {
    expect(acessoSuporteVigente({ expiraEm: new Date(agora.getTime() + dia), revogadoEm: agora }, agora)).toBe(false);
  });
});

describe("validarValidadeAcesso", () => {
  it("aceita validade futura até o máximo", () => {
    expect(validarValidadeAcesso(new Date(agora.getTime() + dia), agora)).toBeNull();
    expect(validarValidadeAcesso(new Date(agora.getTime() + 30 * dia), agora)).toBeNull();
  });
  it("recusa data passada, igual a agora ou inválida", () => {
    expect(validarValidadeAcesso(new Date(agora.getTime() - dia), agora)).not.toBeNull();
    expect(validarValidadeAcesso(agora, agora)).not.toBeNull();
    expect(validarValidadeAcesso(new Date("x"), agora)).not.toBeNull();
  });
  it("recusa validade acima de 30 dias", () => {
    expect(validarValidadeAcesso(new Date(agora.getTime() + 31 * dia), agora)).toMatch(/30 dias/);
  });
});

describe("validarMotivoAcesso", () => {
  it("exige pelo menos 10 caracteres sem contar espaços das pontas", () => {
    expect(validarMotivoAcesso("   curto   ")).not.toBeNull();
    expect(validarMotivoAcesso("chamado 123 sobre importação")).toBeNull();
  });
});
