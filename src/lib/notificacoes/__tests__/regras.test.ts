import { describe, expect, it } from "vitest";
import { agendarHorarioFixo, canalPermitido, EVENTOS_SEMPRE_IMEDIATOS, planejarNotificacoes, REGRAS, type ParametrosPlanejamento } from "../regras";
import type { EventoNotificacao, Membro } from "../tipos";

const TZ = "America/Cuiaba"; // UTC-4

const membro = (id: string, papel: Membro["papel"], extra: Partial<Membro> = {}): Membro => ({
  id,
  nome: `Nome ${id}`,
  papel,
  ativo: true,
  telefoneVerificado: true,
  emailVerificado: true,
  ...extra,
});

const MEMBROS: Membro[] = [
  membro("socia", "socio"),
  membro("socio2", "socio", { telefoneVerificado: false }),
  membro("adv", "advogado"),
  membro("adv2", "advogado", { emailVerificado: false }),
  membro("est", "estagiario", { telefoneVerificado: false, emailVerificado: false }),
  membro("adm", "administrativo"),
  membro("inativo", "advogado", { ativo: false }),
];

// quarta-feira 28/10/2026, 10:00 local (14:00Z): dia útil, dentro do expediente
const AGORA_UTIL = new Date("2026-10-28T14:00:00Z");

function planejar(evento: EventoNotificacao, extra: Partial<ParametrosPlanejamento> = {}) {
  return planejarNotificacoes({
    evento,
    agora: AGORA_UTIL,
    tz: TZ,
    feriados: [],
    membros: MEMBROS,
    responsavelId: "adv",
    usuarioAlvoId: "adv2",
    ausencias: [],
    objeto: { tipo: "publicacao", id: "pub-1" },
    variaveis: { processo: "0001234-56.2026.8.11.0041" },
    ...extra,
  });
}

const resumir = (lista: ReturnType<typeof planejar>) => lista.map((n) => `${n.destinatarioId}/${n.canal}`).sort();

describe("tabela REGRAS", () => {
  it("cobre todos os eventos com canais não vazios", () => {
    const eventos: EventoNotificacao[] = [
      "nova_publicacao", "publicacao_sem_processo", "publicacao_sem_tratamento_24h", "publicacao_sem_tratamento_48h", "prazo_d3", "prazo_d1", "prazo_d0", "prazo_vencido",
      "tarefa_atrasada", "tarefa_reatribuida", "resumo_do_dia", "captacao_falhou", "calendario_incompleto", "convite", "parcela_vencida",
    ];
    // Mesmo conjunto do enum public.evento_notificacao (migrations 0010 e 0030): nada a mais, nada a menos
    expect(Object.keys(REGRAS).sort()).toEqual([...eventos].sort());
    for (const e of eventos) {
      expect(REGRAS[e], e).toBeDefined();
      expect(REGRAS[e].canais.length, e).toBeGreaterThan(0);
    }
    expect(REGRAS.resumo_do_dia).toMatchObject({ destinatarios: "todos_ativos", horarioLocal: "07:30", somenteDiasUteis: true, template: "resumo_do_dia" });
    expect(REGRAS.tarefa_atrasada).toMatchObject({ canais: ["painel"], incluirNoResumo: true });
    expect(REGRAS.prazo_d0.destinatarios).toBe("responsavel_e_socios");
    expect(REGRAS.publicacao_sem_tratamento_48h.destinatarios).toBe("socios");
    expect(REGRAS.captacao_falhou.canais).toEqual(expect.arrayContaining(["email", "whatsapp"]));
    expect(REGRAS.convite.canais).toEqual(["email"]);
    expect(REGRAS.publicacao_sem_processo).toMatchObject({ destinatarios: "socios_e_administrativo", canais: ["painel", "email"], horarioLocal: "imediato", somenteDiasUteis: true });
    expect(REGRAS.publicacao_sem_processo.template).toBeUndefined();
    expect(REGRAS.prazo_vencido).toMatchObject({ destinatarios: "responsavel_e_socios", canais: ["painel", "whatsapp", "email"], horarioLocal: "imediato", somenteDiasUteis: false, template: "alerta_prazo" });
    expect([...EVENTOS_SEMPRE_IMEDIATOS].sort()).toEqual(["captacao_falhou", "prazo_d0", "prazo_vencido"]);
  });
});

describe("planejarNotificacoes — destinatários e canais", () => {
  it("nova_publicacao → responsável, painel + whatsapp imediato, com template", () => {
    const lista = planejar("nova_publicacao");
    expect(resumir(lista)).toEqual(["adv/painel", "adv/whatsapp"]);
    const wa = lista.find((n) => n.canal === "whatsapp")!;
    expect(wa.template).toBe("nova_publicacao");
    expect(wa.agendadaPara).toBe(AGORA_UTIL.toISOString());
    expect(wa.chaveDedup).toBe("nova_publicacao:publicacao:pub-1:adv:whatsapp:2026-10-28");
    expect(wa.variaveis).toEqual({ processo: "0001234-56.2026.8.11.0041" });
    expect(lista.find((n) => n.canal === "painel")!.template).toBeUndefined();
  });

  it("publicacao_sem_tratamento_24h → responsável; 48h → sócios (sem whatsapp para quem não tem telefone verificado)", () => {
    expect(resumir(planejar("publicacao_sem_tratamento_24h"))).toEqual(["adv/painel", "adv/whatsapp"]);
    expect(resumir(planejar("publicacao_sem_tratamento_48h"))).toEqual(["socia/painel", "socia/whatsapp", "socio2/painel"]);
  });

  it("prazo_d3 e prazo_d1 → responsável; prazo_d0 → responsável e sócios, sem duplicar quando o responsável é sócio", () => {
    expect(resumir(planejar("prazo_d3"))).toEqual(["adv/painel", "adv/whatsapp"]);
    expect(resumir(planejar("prazo_d1"))).toEqual(["adv/painel", "adv/whatsapp"]);
    expect(resumir(planejar("prazo_d0"))).toEqual(["adv/painel", "adv/whatsapp", "socia/painel", "socia/whatsapp", "socio2/painel"]);
    expect(resumir(planejar("prazo_d0", { responsavelId: "socia" }))).toEqual(["socia/painel", "socia/whatsapp", "socio2/painel"]);
  });

  it("publicacao_sem_processo → sócios e administrativo por painel e e-mail, sem whatsapp nem template", () => {
    const lista = planejar("publicacao_sem_processo", { responsavelId: undefined });
    expect(resumir(lista)).toEqual(["adm/email", "adm/painel", "socia/email", "socia/painel", "socio2/email", "socio2/painel"]);
    expect(lista.every((n) => n.template === undefined)).toBe(true);
    // em dia útil no expediente sai na hora
    expect(lista.every((n) => n.agendadaPara === AGORA_UTIL.toISOString())).toBe(true);
    // no sábado, o e-mail espera a abertura do próximo dia útil; o painel não
    const sabado = new Date("2026-10-31T14:00:00Z");
    const fds = planejar("publicacao_sem_processo", { agora: sabado });
    expect(fds.find((n) => n.canal === "painel")!.agendadaPara).toBe(sabado.toISOString());
    expect(fds.find((n) => n.canal === "email")!.agendadaPara).toBe("2026-11-02T11:00:00.000Z");
  });

  it("prazo_vencido → responsável e sócios por painel, whatsapp e e-mail, com template alerta_prazo e sempre na hora", () => {
    const madrugada = new Date("2026-10-31T04:05:00Z"); // sábado 00:05 local, horário do job de vencidos
    const lista = planejar("prazo_vencido", { agora: madrugada, objeto: { tipo: "prazo", id: "pz-1" } });
    expect(resumir(lista)).toEqual(["adv/email", "adv/painel", "adv/whatsapp", "socia/email", "socia/painel", "socia/whatsapp", "socio2/email", "socio2/painel"]);
    expect(lista.every((n) => n.agendadaPara === madrugada.toISOString())).toBe(true);
    expect(lista.filter((n) => n.canal === "whatsapp").every((n) => n.template === "alerta_prazo")).toBe(true);
    expect(lista.filter((n) => n.canal !== "whatsapp").every((n) => n.template === undefined)).toBe(true);
    expect(lista[0].chaveDedup.startsWith("prazo_vencido:prazo:pz-1:")).toBe(true);
    // responsável que é sócio não recebe em dobro
    expect(resumir(planejar("prazo_vencido", { responsavelId: "socia" }))).toEqual(["socia/email", "socia/painel", "socia/whatsapp", "socio2/email", "socio2/painel"]);
  });

  it("responsável ausente sem id definido → sócios assumem", () => {
    expect(resumir(planejar("nova_publicacao", { responsavelId: undefined }))).toEqual(["socia/painel", "socia/whatsapp", "socio2/painel"]);
  });

  it("tarefa_atrasada → só painel, às 07:30 do próximo dia útil", () => {
    const lista = planejar("tarefa_atrasada");
    expect(resumir(lista)).toEqual(["adv/painel"]);
    expect(lista[0].agendadaPara).toBe("2026-10-29T11:30:00.000Z"); // já passou das 07:30 de hoje
  });

  it("tarefa_reatribuida → usuário alvo imediato; convite → só e-mail, mesmo sem e-mail verificado", () => {
    expect(resumir(planejar("tarefa_reatribuida"))).toEqual(["adv2/painel", "adv2/whatsapp"]);
    const convite = planejar("convite", { usuarioAlvoId: "est" });
    expect(resumir(convite)).toEqual(["est/email"]);
    // convidado ainda sem cadastro em membros também recebe e-mail
    expect(resumir(planejar("convite", { usuarioAlvoId: "novo" }))).toEqual(["novo/email"]);
    // sem alvo, nada a fazer
    expect(planejar("tarefa_reatribuida", { usuarioAlvoId: undefined })).toEqual([]);
  });

  it("resumo_do_dia → todos ativos, respeitando verificação de telefone e e-mail; inativo fora", () => {
    const lista = planejar("resumo_do_dia");
    expect(resumir(lista)).toEqual([
      "adm/email", "adm/painel", "adm/whatsapp",
      "adv/email", "adv/painel", "adv/whatsapp",
      "adv2/painel", "adv2/whatsapp",
      "est/painel",
      "socia/email", "socia/painel", "socia/whatsapp",
      "socio2/email", "socio2/painel",
    ]);
    expect(lista.every((n) => n.destinatarioId !== "inativo")).toBe(true);
    expect(lista.filter((n) => n.canal === "whatsapp").every((n) => n.template === "resumo_do_dia")).toBe(true);
  });

  it("captacao_falhou → sócios por painel, e-mail e whatsapp, sempre imediato", () => {
    const madrugada = new Date("2026-10-31T06:00:00Z"); // sábado 02:00 local
    const lista = planejar("captacao_falhou", { agora: madrugada });
    expect(resumir(lista)).toEqual(["socia/email", "socia/painel", "socia/whatsapp", "socio2/email", "socio2/painel"]);
    expect(lista.every((n) => n.agendadaPara === madrugada.toISOString())).toBe(true);
  });

  it("calendario_incompleto → sócios e administrativo (painel + e-mail)", () => {
    expect(resumir(planejar("calendario_incompleto"))).toEqual(["adm/email", "adm/painel", "socia/email", "socia/painel", "socio2/email", "socio2/painel"]);
  });

  it("canalPermitido: painel sempre para membro conhecido; whatsapp e e-mail exigem verificação", () => {
    const m = membro("x", "advogado", { telefoneVerificado: false, emailVerificado: false });
    expect(canalPermitido("painel", m, "nova_publicacao")).toBe(true);
    expect(canalPermitido("painel", undefined, "nova_publicacao")).toBe(false);
    expect(canalPermitido("whatsapp", m, "nova_publicacao")).toBe(false);
    expect(canalPermitido("email", m, "resumo_do_dia")).toBe(false);
    expect(canalPermitido("email", m, "convite")).toBe(true);
  });
});

describe("planejarNotificacoes — horários", () => {
  it("resumo às 07:30 local agenda para 11:30Z do próprio dia quando ainda não passou", () => {
    const cedo = new Date("2026-10-29T09:00:00Z"); // quinta 05:00 local
    const lista = planejar("resumo_do_dia", { agora: cedo });
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every((n) => n.agendadaPara === "2026-10-29T11:30:00.000Z")).toBe(true);
    expect(lista[0].chaveDedup.endsWith(":2026-10-29")).toBe(true);
  });

  it("resumo gerado na sexta à noite cai na segunda 07:30 (11:30Z); feriado na segunda empurra para terça", () => {
    const sextaNoite = new Date("2026-10-30T23:30:00Z"); // sexta 19:30 local
    expect(planejar("resumo_do_dia", { agora: sextaNoite })[0].agendadaPara).toBe("2026-11-02T11:30:00.000Z");
    expect(planejar("resumo_do_dia", { agora: sextaNoite, feriados: ["2026-11-02"] })[0].agendadaPara).toBe("2026-11-03T11:30:00.000Z");
  });

  it("agendarHorarioFixo trata o instante exato como ainda válido", () => {
    const exato = new Date("2026-10-28T11:30:00Z");
    expect(agendarHorarioFixo(exato, 7, 30, { tz: TZ, feriados: [], somenteDiasUteis: true }).toISOString()).toBe("2026-10-28T11:30:00.000Z");
    expect(agendarHorarioFixo(new Date("2026-10-28T11:30:01Z"), 7, 30, { tz: TZ, feriados: [], somenteDiasUteis: true }).toISOString()).toBe(
      "2026-10-29T11:30:00.000Z",
    );
  });

  it("whatsapp imediato fora do expediente (antes das 7h / depois das 20h) vai para as 7h do próximo dia útil; painel fica imediato", () => {
    // quarta 21:00 local = 2026-10-29T01:00Z → quinta 07:00 local = 11:00Z
    const noite = new Date("2026-10-29T01:00:00Z");
    const lista = planejar("nova_publicacao", { agora: noite });
    expect(lista.find((n) => n.canal === "painel")!.agendadaPara).toBe(noite.toISOString());
    const wa = lista.find((n) => n.canal === "whatsapp")!;
    expect(wa.agendadaPara).toBe("2026-10-29T11:00:00.000Z");
    expect(wa.chaveDedup.endsWith(":2026-10-29")).toBe(true);

    // quinta 05:00 local → mesma quinta 07:00
    expect(planejar("nova_publicacao", { agora: new Date("2026-10-29T09:00:00Z") }).find((n) => n.canal === "whatsapp")!.agendadaPara).toBe(
      "2026-10-29T11:00:00.000Z",
    );
    // 19:59 local ainda sai; 20:00 já não
    expect(planejar("nova_publicacao", { agora: new Date("2026-10-28T23:59:00Z") }).find((n) => n.canal === "whatsapp")!.agendadaPara).toBe(
      "2026-10-28T23:59:00.000Z",
    );
    expect(planejar("nova_publicacao", { agora: new Date("2026-10-29T00:00:00Z") }).find((n) => n.canal === "whatsapp")!.agendadaPara).toBe(
      "2026-10-29T11:00:00.000Z",
    );
  });

  it("nova_publicacao no sábado de dia sai na hora (não exige dia útil); prazo_d3 no sábado espera segunda 7h", () => {
    const sabado = new Date("2026-10-31T14:00:00Z"); // sábado 10:00 local
    expect(planejar("nova_publicacao", { agora: sabado }).find((n) => n.canal === "whatsapp")!.agendadaPara).toBe(sabado.toISOString());
    expect(planejar("prazo_d3", { agora: sabado }).find((n) => n.canal === "whatsapp")!.agendadaPara).toBe("2026-11-02T11:00:00.000Z");
  });

  it("prazo_d0 ignora a janela do whatsapp", () => {
    const noite = new Date("2026-10-29T01:00:00Z");
    const lista = planejar("prazo_d0", { agora: noite });
    expect(lista.every((n) => n.agendadaPara === noite.toISOString())).toBe(true);
  });

  it("e-mail imediato em dia não útil com somenteDiasUteis espera a abertura do próximo dia útil", () => {
    const sabado = new Date("2026-10-31T14:00:00Z");
    const lista = planejar("calendario_incompleto", { agora: sabado });
    expect(lista.find((n) => n.canal === "painel")!.agendadaPara).toBe(sabado.toISOString());
    expect(lista.find((n) => n.canal === "email")!.agendadaPara).toBe("2026-11-02T11:00:00.000Z");
  });
});

describe("planejarNotificacoes — ausências", () => {
  it("responsável ausente com substituto → substituto recebe, com motivo e nome do substituído nas variáveis", () => {
    const lista = planejar("nova_publicacao", {
      ausencias: [{ usuarioId: "adv", inicio: "2026-10-26", fim: "2026-10-30", substitutoId: "adv2" }],
    });
    expect(resumir(lista)).toEqual(["adv2/painel", "adv2/whatsapp"]);
    for (const n of lista) {
      expect(n.motivo).toBe("ausencia");
      expect(n.substituiA).toBe("adv");
      expect(n.variaveis.substitui_a).toBe("Nome adv");
      expect(n.chaveDedup).toContain(":adv2:");
    }
  });

  it("responsável ausente sem substituto → sócios; sócio ausente é pulado", () => {
    const lista = planejar("nova_publicacao", {
      ausencias: [
        { usuarioId: "adv", inicio: "2026-10-26", fim: "2026-10-30" },
        { usuarioId: "socio2", inicio: "2026-10-28", fim: "2026-10-28" },
      ],
    });
    expect(resumir(lista)).toEqual(["socia/painel", "socia/whatsapp"]);
    expect(lista[0].motivo).toBe("ausencia_sem_substituto");
  });

  it("ausência é avaliada pelo dia local de agora, não pelo UTC", () => {
    // 2026-10-31T02:00Z ainda é sexta 30/10 22:00 em Cuiabá: ausência até 30/10 vale
    const lista = planejar("nova_publicacao", {
      agora: new Date("2026-10-31T02:00:00Z"),
      ausencias: [{ usuarioId: "adv", inicio: "2026-10-30", fim: "2026-10-30", substitutoId: "adv2" }],
    });
    expect(lista.every((n) => n.destinatarioId === "adv2")).toBe(true);
  });

  it("no resumo do dia, um ausente com substituto não gera duplicata para o substituto", () => {
    const lista = planejar("resumo_do_dia", {
      ausencias: [{ usuarioId: "adv", inicio: "2026-10-26", fim: "2026-10-30", substitutoId: "adv2" }],
    });
    const paraAdv2 = lista.filter((n) => n.destinatarioId === "adv2");
    expect(paraAdv2.map((n) => n.canal).sort()).toEqual(["painel", "whatsapp"]);
    expect(lista.some((n) => n.destinatarioId === "adv")).toBe(false);
    // adv2 já era destinatário direto: a notificação é a dele, não "em substituição"
    expect(paraAdv2.every((n) => n.motivo === undefined)).toBe(true);
  });
});
