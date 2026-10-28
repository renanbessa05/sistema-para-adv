import { describe, expect, it } from "vitest";
import { anosEntre, classificarDia, diaUtilOuProximo, diasDeRecesso, ehDiaUtil, montarCalendario, proximoDiaUtil, subtrairDiasUteis } from "../calendario";
import type { DiaSemExpediente } from "../tipos";
import { COMARCA_CUIABA, DIAS_TJMT, calendarioCuiaba, calendarioSemComarca } from "./fixture-calendario";

describe("calendário", () => {
  it("gera o recesso de 20/12 a 20/01 (CPC art. 220)", () => {
    const dias = diasDeRecesso(2026);
    expect(dias[0].data).toBe("2026-12-20");
    expect(dias.at(-1)?.data).toBe("2027-01-20");
    expect(dias).toHaveLength(32);
    expect(dias.every((d) => d.abrangencia === "recesso" && d.suspendePrazo)).toBe(true);
  });

  it("aplica feriado municipal só na comarca certa e avisa anos cobertos", () => {
    const cuiaba = calendarioCuiaba();
    const outra = montarCalendario(DIAS_TJMT, { tribunal: "TJMT", comarcaId: "comarca-sinop", anosCobertos: [2026, 2027] });
    const semComarca = calendarioSemComarca();
    expect(ehDiaUtil("2026-04-08", cuiaba)).toBe(false);
    expect(ehDiaUtil("2026-04-08", outra)).toBe(true);
    expect(ehDiaUtil("2026-04-08", semComarca)).toBe(true);
    expect(cuiaba.anosCobertos).toEqual([2026, 2027]);
    expect(cuiaba.comarcaId).toBe(COMARCA_CUIABA);
    expect(semComarca.comarcaId).toBeNull();
  });

  it("deduz os anos cobertos quando não informados e não duplica recesso vindo da tabela", () => {
    const comRecessoExplicito: DiaSemExpediente[] = [
      { data: "2026-12-25", descricao: "Natal", abrangencia: "nacional", suspendePrazo: true },
      { data: "2026-12-24", descricao: "Recesso forense", abrangencia: "recesso", suspendePrazo: true },
    ];
    const cal = montarCalendario(comRecessoExplicito, { tribunal: "TJMT" });
    expect(cal.anosCobertos).toEqual([2026]);
    expect(cal.diasPorData.get("2026-12-24")?.filter((d) => d.abrangencia === "recesso")).toHaveLength(1);
    // 25/12 tem Natal + recesso gerado
    expect(cal.diasPorData.get("2026-12-25")?.map((d) => d.abrangencia).sort()).toEqual(["nacional", "recesso"]);
    // recesso do ano anterior também entra (20/12/2025 a 20/01/2026)
    expect(ehDiaUtil("2026-01-15", cal)).toBe(false);
  });

  it("pode ser montado sem recesso automático", () => {
    const cal = montarCalendario([], { tribunal: "TJMT", anosCobertos: [2026], incluirRecesso: false });
    expect(ehDiaUtil("2026-12-22", cal)).toBe(true);
  });

  it("rejeita data inválida na tabela", () => {
    expect(() => montarCalendario([{ data: "2026-13-01", descricao: "x", abrangencia: "nacional", suspendePrazo: true }], { tribunal: "TJMT" })).toThrow();
  });

  it("classifica dias: fim de semana, feriado, expediente reduzido e dia comum", () => {
    const cal = calendarioCuiaba();
    expect(classificarDia("2026-03-07", cal)).toEqual({ util: false, motivo: "sábado", suspendePrazo: true });
    expect(classificarDia("2026-03-08", cal)).toEqual({ util: false, motivo: "domingo", suspendePrazo: true });
    expect(classificarDia("2026-04-03", cal)).toEqual({ util: false, motivo: "Sexta-feira Santa", suspendePrazo: true });
    expect(classificarDia("2026-06-24", cal)).toEqual({ util: true, motivo: "Expediente reduzido (jogo da Copa)", suspendePrazo: false });
    expect(classificarDia("2026-03-09", cal)).toEqual({ util: true, motivo: null, suspendePrazo: false });
    // recesso ignorado para prazo material
    expect(classificarDia("2026-12-22", cal, false).util).toBe(true);
    expect(classificarDia("2026-12-25", cal, false).util).toBe(false);
  });

  it("acha o próximo dia útil pulando feriado e fim de semana", () => {
    const cal = calendarioCuiaba();
    expect(proximoDiaUtil("2026-04-02", cal)).toBe("2026-04-06");
    expect(diaUtilOuProximo("2026-04-06", cal)).toBe("2026-04-06");
    expect(diaUtilOuProximo("2026-04-05", cal)).toBe("2026-04-06");
  });

  it("subtrai dias úteis para a data interna", () => {
    const cal = calendarioCuiaba();
    expect(subtrairDiasUteis("2026-03-30", 2, cal)).toBe("2026-03-26");
    expect(subtrairDiasUteis("2026-04-06", 1, cal)).toBe("2026-04-02");
    expect(subtrairDiasUteis("2026-03-30", 0, cal)).toBe("2026-03-30");
  });

  it("protege contra calendário sem dias úteis", () => {
    const bloqueio: DiaSemExpediente[] = [];
    let d = "2026-01-01";
    for (let i = 0; i < 450; i++) {
      bloqueio.push({ data: d, descricao: "fechado", abrangencia: "suspensao_ad_hoc", suspendePrazo: true });
      d = d === "2026-12-31" ? "2027-01-01" : incrementar(d);
    }
    const cal = montarCalendario(bloqueio, { tribunal: "X", anosCobertos: [2026, 2027] });
    expect(() => proximoDiaUtil("2026-01-01", cal)).toThrow(/400 dias/);
    expect(() => subtrairDiasUteis("2027-03-01", 1, cal)).toThrow(/400 dias/);
  });

  it("lista anos entre duas datas", () => {
    expect(anosEntre("2026-12-15", "2027-02-11")).toEqual([2026, 2027]);
    expect(anosEntre("2026-03-01", "2026-03-30")).toEqual([2026]);
  });
});

function incrementar(data: string): string {
  const [a, m, d] = data.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}
