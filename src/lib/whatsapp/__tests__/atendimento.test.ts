import { describe, expect, it } from "vitest";
import { codigoDaMensagem, decidirEnvio, ehOptOut, situacaoHorario, type EstadoContatoParaEnvio } from "../atendimento";
import { comIdentificacao, dataBr, identificacao, montarEnvioRespostaEscritorio, textoForaDoHorario, TEXTOS_FIXOS } from "../templates-cliente";

// Cuiabá é UTC-4 sem horário de verão. 29/10/2026 é uma quinta-feira; 31/10/2026, um sábado.
const quintaComHorarioCuiaba = (hh: number) => new Date(Date.UTC(2026, 9, 29, hh + 4, 0));
const sabadoAoMeioDia = new Date(Date.UTC(2026, 9, 31, 16, 0));
const regraSemana = { horarioInicio: "08:00:00", horarioFim: "18:00:00", diasSemana: [1, 2, 3, 4, 5] };

describe("situacaoHorario", () => {
  it("sem configuração, nunca inventa horário", () => {
    expect(situacaoHorario(null, quintaComHorarioCuiaba(12), "America/Cuiaba")).toBe("sem_horario");
    expect(situacaoHorario({ horarioInicio: null, horarioFim: null, diasSemana: null }, quintaComHorarioCuiaba(12), "America/Cuiaba")).toBe("sem_horario");
    expect(situacaoHorario({ horarioInicio: "08:00", horarioFim: "18:00", diasSemana: [] }, quintaComHorarioCuiaba(12), "America/Cuiaba")).toBe("sem_horario");
  });

  it("dentro da faixa em dia configurado", () => {
    expect(situacaoHorario(regraSemana, quintaComHorarioCuiaba(12), "America/Cuiaba")).toBe("dentro");
    expect(situacaoHorario(regraSemana, quintaComHorarioCuiaba(8), "America/Cuiaba")).toBe("dentro");
  });

  it("fora da faixa ou do dia configurado", () => {
    expect(situacaoHorario(regraSemana, quintaComHorarioCuiaba(7), "America/Cuiaba")).toBe("fora");
    expect(situacaoHorario(regraSemana, quintaComHorarioCuiaba(18), "America/Cuiaba")).toBe("fora");
    expect(situacaoHorario(regraSemana, sabadoAoMeioDia, "America/Cuiaba")).toBe("fora");
  });
});

describe("ehOptOut e codigoDaMensagem", () => {
  it("reconhece descadastro e ignora outras mensagens", () => {
    expect(ehOptOut("Sair")).toBe(true);
    expect(ehOptOut(" parar! ")).toBe(true);
    expect(ehOptOut("cancelar")).toBe(true);
    expect(ehOptOut("oi, quero sair do processo")).toBe(false);
  });

  it("aceita só seis dígitos, com espaços tolerados", () => {
    expect(codigoDaMensagem(" 123 456 ")).toBe("123456");
    expect(codigoDaMensagem("12345")).toBeNull();
    expect(codigoDaMensagem("código 123456")).toBeNull();
  });
});

describe("decidirEnvio", () => {
  const base: EstadoContatoParaEnvio = { envioAtivo: true, verificado: true, optIn: true, optOut: false, processoSigiloso: false, origem: "aprovada" };

  it("envia quando tudo está em ordem", () => {
    expect(decidirEnvio(base)).toEqual({ enviar: true });
  });

  it("processo sigiloso bloqueia antes de qualquer outra regra", () => {
    expect(decidirEnvio({ ...base, processoSigiloso: true, envioAtivo: false })).toEqual({ enviar: false, motivo: "processo em segredo de justiça: envio bloqueado" });
  });

  it("envio desligado bloqueia", () => {
    expect(decidirEnvio({ ...base, envioAtivo: false })).toMatchObject({ enviar: false });
  });

  it("sem verificação, opt-out ou sem opt-in, não envia", () => {
    expect(decidirEnvio({ ...base, verificado: false })).toMatchObject({ enviar: false });
    expect(decidirEnvio({ ...base, optOut: true })).toEqual({ enviar: false, motivo: "cliente pediu para não receber mensagens" });
    expect(decidirEnvio({ ...base, optIn: false })).toMatchObject({ enviar: false });
  });

  it("opt-out vence mesmo com opt-in anterior", () => {
    expect(decidirEnvio({ ...base, optIn: true, optOut: true }).enviar).toBe(false);
  });
});

describe("textos fixos", () => {
  it("toda resposta automática começa pela identificação de IA", () => {
    expect(comIdentificacao("Escritório X", TEXTOS_FIXOS.recebido).startsWith(identificacao("Escritório X"))).toBe(true);
    expect(identificacao("Escritório X")).toContain("assistente virtual (IA)");
  });

  it("horário sem configuração não promete hora nenhuma", () => {
    expect(textoForaDoHorario({ inicio: null, fim: null })).toBe(TEXTOS_FIXOS.recebido);
    expect(textoForaDoHorario({ inicio: "08:00:00", fim: "18:00:00" })).toContain("das 08:00 às 18:00");
  });

  it("data ISO vira DD/MM/AAAA sem depender do fuso", () => {
    expect(dataBr("2026-10-29")).toBe("29/10/2026");
    expect(dataBr("2026-10-29T23:30:00-04:00")).toBe("29/10/2026");
  });

  it("template de resposta: uma linha, sem quebras, e variáveis preenchidas", () => {
    const envio = montarEnvioRespostaEscritorio("Escritório X", "linha 1\n\tlinha 2");
    expect(envio.nome).toBe("resposta_escritorio");
    const texto = envio.componentes[0].parameters[1].text;
    expect(texto).not.toMatch(/[\n\t]/);
    expect(texto).toContain("linha 1");
  });
});
