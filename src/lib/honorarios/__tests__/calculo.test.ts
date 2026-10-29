import { describe, expect, it } from "vitest";
import { calcularHonorarios, sugeridoParcelas, validarConfirmacao, FATORES_PADRAO, ROTULO_MODALIDADE } from "../calculo";
import { ITENS_TABELA_OAB_MT, TABELA_OAB_MT_URH, TABELA_OAB_MT_VIGENCIA, itemTabelaOab } from "../tabela-oab-mt";
import { arredondarReais, formatarReais, tabelaVencida, urhParaReais, type TabelaHonorarios } from "../tabela";
import { sugerirModalidade } from "../modalidade";
import { inteiroPorExtenso, percentualPorExtenso, reaisPorExtenso } from "../extenso";

const tabela: TabelaHonorarios = { id: "t1", uf: "MT", vigenciaInicio: TABELA_OAB_MT_VIGENCIA, valorUrh: TABELA_OAB_MT_URH, itens: ITENS_TABELA_OAB_MT };
const HOJE = "2026-10-29";
const URH = TABELA_OAB_MT_URH;

describe("tabela OAB/MT", () => {
  it("tem códigos únicos e todo item tem múltiplo ou percentual", () => {
    const codigos = new Set(ITENS_TABELA_OAB_MT.map((i) => i.codigo));
    expect(codigos.size).toBe(ITENS_TABELA_OAB_MT.length);
    for (const i of ITENS_TABELA_OAB_MT) {
      expect(i.multiploUrh !== null || i.percentual !== null, i.codigo).toBe(true);
      if (i.percentual !== null) expect(i.minimoUrh, i.codigo).not.toBeNull();
    }
    expect(itemTabelaOab("IX.ordinario")?.minimoUrh).toBe(8);
    expect(itemTabelaOab("nao.existe")).toBeUndefined();
  });

  it("vence 12 meses após a vigência", () => {
    expect(tabelaVencida("2026-03-12", "2026-10-29")).toBe(false);
    expect(tabelaVencida("2026-03-12", "2027-03-12")).toBe(false);
    expect(tabelaVencida("2026-03-12", "2027-03-13")).toBe(true);
  });

  it("converte e formata reais", () => {
    expect(urhParaReais(8, 1339.07)).toBe(10712.56);
    expect(arredondarReais(10.126)).toBe(10.13);
    expect(arredondarReais(10.124)).toBe(10.12);
    expect(formatarReais(1234.5)).toMatch(/R\$\s1\.234,50/);
  });
});

describe("calcularHonorarios", () => {
  it("procedimento ordinário: maior entre 8 URH e 20% do proveito, com fator de complexidade", () => {
    const baixo = calcularHonorarios({ rubricas: ["IX.ordinario"], proveitoEconomico: 10_000, complexidade: "baixa", hoje: HOJE }, tabela);
    expect(baixo.bloqueio).toBeNull();
    expect(baixo.piso).toEqual({ urh: 8, reais: urhParaReais(8, URH) });
    expect(baixo.percentual).toEqual({ taxa: 20, base: 10_000, reais: 2000 });
    expect(baixo.base).toBe(baixo.piso.reais);
    expect(baixo.sugerido).toBe(baixo.piso.reais);
    expect(baixo.alertas).toEqual([]);

    const alto = calcularHonorarios({ rubricas: ["IX.ordinario"], proveitoEconomico: 200_000, complexidade: "alta", hoje: HOJE }, tabela);
    expect(alto.percentual?.reais).toBe(40_000);
    expect(alto.base).toBe(40_000);
    expect(alto.sugerido).toBe(arredondarReais(40_000 * FATORES_PADRAO.alta));
    expect(alto.tetoArt50).toBe(200_000);
    expect(alto.modalidades.map((m) => m.tipo)).toEqual(["fixo", "exito", "misto", "fixo_parcelado"]);
    expect(alto.modalidades.find((m) => m.tipo === "exito")?.percentual).toBe(20);
    expect(alto.modalidades.find((m) => m.tipo === "misto")?.percentual).toBe(15);
    expect(alto.modalidades.every((m) => m.disponivel)).toBe(true);
    expect(alto.modalidades.find((m) => m.tipo === "fixo_parcelado")?.parcelas).toBe(12);
  });

  it("família: 5% com mínimo em URH; sem proveito as modalidades de êxito ficam indisponíveis", () => {
    const r = calcularHonorarios({ rubricas: ["XI.inventario"], proveitoEconomico: null, complexidade: "media", hoje: HOJE }, tabela);
    expect(r.piso.urh).toBe(4);
    expect(r.percentual).toBeNull();
    expect(r.alertas).toContain("proveito_desconhecido");
    expect(r.modalidades.find((m) => m.tipo === "exito")?.disponivel).toBe(false);
    expect(r.modalidades.find((m) => m.tipo === "misto")?.estimativaTotal).toBeNull();
    expect(r.sugerido).toBe(arredondarReais(urhParaReais(4, URH) * FATORES_PADRAO.media));
    const com = calcularHonorarios({ rubricas: ["XI.inventario"], proveitoEconomico: 1_000_000, complexidade: "baixa", hoje: HOJE }, tabela);
    expect(com.percentual?.taxa).toBe(5);
    expect(com.modalidades.find((m) => m.tipo === "misto")?.percentual).toBe(10);
  });

  it("soma rubricas e aplica +50% na cautelar satisfativa", () => {
    const r = calcularHonorarios({ rubricas: ["IX.ordinario", "VIII.cautelar"], proveitoEconomico: 1000, complexidade: "baixa", cautelarSatisfativa: true, hoje: HOJE }, tabela);
    expect(r.rubricas.map((x) => x.urh)).toEqual([8, 6]);
    expect(r.piso.urh).toBe(14);
    expect(r.alertas).toContain("cautelar_satisfativa");
    const sem = calcularHonorarios({ rubricas: ["IX.ordinario", "VIII.cautelar"], proveitoEconomico: 1000, complexidade: "baixa", hoje: HOJE }, tabela);
    expect(sem.piso.urh).toBe(12);
  });

  it("trabalhista 30% sinaliza acima_30; previdenciária 20%; fatores customizados e parcelas pedidas", () => {
    const t = calcularHonorarios({ rubricas: ["XVII.reclamatoria_ordinario"], proveitoEconomico: 50_000, complexidade: "media", hoje: HOJE, fatores: { media: 1.1 }, parcelas: 3 }, tabela);
    expect(t.modalidades.find((m) => m.tipo === "exito")?.percentual).toBe(30);
    expect(t.alertas).not.toContain("acima_30");
    expect(t.fator).toBe(1.1);
    expect(t.modalidades.find((m) => m.tipo === "fixo_parcelado")?.parcelas).toBe(3);
    const fake: TabelaHonorarios = { ...tabela, itens: [{ codigo: "Z.alto", secao: "Z", item: "teste", multiploUrh: null, percentual: 50, minimoUrh: 1 }] };
    const z = calcularHonorarios({ rubricas: ["Z.alto"], proveitoEconomico: 1000, complexidade: "baixa", hoje: HOJE }, fake);
    expect(z.alertas).toEqual(expect.arrayContaining(["acima_30", "perto_teto_art50"]));
  });

  it("bloqueia tabela vencida, rubrica desconhecida e lista vazia", () => {
    expect(calcularHonorarios({ rubricas: ["IX.ordinario"], proveitoEconomico: 1, complexidade: "baixa", hoje: "2027-06-01" }, tabela).bloqueio).toBe("tabela_vencida");
    const r = calcularHonorarios({ rubricas: ["nao.existe"], proveitoEconomico: 1, complexidade: "baixa", hoje: HOJE }, tabela);
    expect(r.bloqueio).toBe("sem_rubrica");
    expect(r.alertas).toContain("rubrica_desconhecida");
    expect(ROTULO_MODALIDADE.misto).toMatch(/Misto/);
  });

  it("sugere parcelas por faixa", () => {
    expect(sugeridoParcelas(1000, URH)).toBe(1);
    expect(sugeridoParcelas(5000, URH)).toBe(3);
    expect(sugeridoParcelas(100_000, URH)).toBe(12);
  });
});

describe("validarConfirmacao", () => {
  const r = calcularHonorarios({ rubricas: ["IX.ordinario"], proveitoEconomico: 100_000, complexidade: "media", hoje: HOJE }, tabela);
  it("recusa valor fixo abaixo do piso e percentual ausente", () => {
    const abaixo = validarConfirmacao({ modalidade: "fixo", valorFixo: 100, percentual: null }, r);
    expect(abaixo.ok).toBe(false);
    expect(abaixo.alertas).toContain("abaixo_piso");
    expect(validarConfirmacao({ modalidade: "exito", valorFixo: null, percentual: null }, r).ok).toBe(false);
    expect(validarConfirmacao({ modalidade: "misto", valorFixo: null, percentual: 10 }, r).ok).toBe(false);
  });
  it("aceita valores válidos e sinaliza risco acima de 30% e perto do teto", () => {
    expect(validarConfirmacao({ modalidade: "fixo", valorFixo: r.piso.reais, percentual: null }, r)).toEqual({ ok: true, alertas: [], erros: [] });
    const alto = validarConfirmacao({ modalidade: "exito", valorFixo: null, percentual: 95 }, r);
    expect(alto.ok).toBe(true);
    expect(alto.alertas).toEqual(expect.arrayContaining(["acima_30", "perto_teto_art50"]));
    const misto = validarConfirmacao({ modalidade: "misto", valorFixo: 500, percentual: 15 }, r);
    expect(misto.ok).toBe(true);
    const exitoBaixo = validarConfirmacao({ modalidade: "exito", valorFixo: null, percentual: 1 }, r);
    expect(exitoBaixo.alertas).toContain("abaixo_piso");
  });
  it("tabela vencida vira erro", () => {
    const v = calcularHonorarios({ rubricas: ["IX.ordinario"], proveitoEconomico: 1, complexidade: "baixa", hoje: "2027-06-01" }, tabela);
    expect(validarConfirmacao({ modalidade: "fixo", valorFixo: 99999, percentual: null }, v).ok).toBe(false);
    const semRubrica = calcularHonorarios({ rubricas: [], proveitoEconomico: 1, complexidade: "baixa", hoje: HOJE }, tabela);
    expect(validarConfirmacao({ modalidade: "fixo", valorFixo: 1, percentual: null }, semRubrica).erros[0]).toMatch(/rubrica/);
  });
});

describe("sugerirModalidade", () => {
  it("segue a matriz da skill", () => {
    expect(sugerirModalidade({ proveito: "alto", tese: "solida", liquidezCliente: "sem_liquidez", trabalho: "medio", clienteNovo: false, tituloFormado: true }).modalidade).toBe("exito");
    expect(sugerirModalidade({ proveito: "inestimavel", tese: "desconhecida", liquidezCliente: "com_caixa", trabalho: "medio", clienteNovo: false, tituloFormado: false }).modalidade).toBe("fixo");
    expect(sugerirModalidade({ proveito: "medio", tese: "solida", liquidezCliente: "fluxo_sem_caixa", trabalho: "pontual", clienteNovo: false, tituloFormado: false }).modalidade).toBe("fixo_parcelado");
    expect(sugerirModalidade({ proveito: "medio", tese: "incerta", liquidezCliente: "com_caixa", trabalho: "longo", clienteNovo: false, tituloFormado: false }).modalidade).toBe("misto");
    expect(sugerirModalidade({ proveito: "alto", tese: "incerta", liquidezCliente: "com_caixa", trabalho: "medio", clienteNovo: false, tituloFormado: false }).modalidade).toBe("misto");
    expect(sugerirModalidade({ proveito: "baixo", tese: "solida", liquidezCliente: "sem_liquidez", trabalho: "medio", clienteNovo: false, tituloFormado: false }).modalidade).toBe("exito");
    expect(sugerirModalidade({ proveito: "medio", tese: "solida", liquidezCliente: "fluxo_sem_caixa", trabalho: "medio", clienteNovo: false, tituloFormado: false }).modalidade).toBe("fixo_parcelado");
    expect(sugerirModalidade({ proveito: "medio", tese: "solida", liquidezCliente: "com_caixa", trabalho: "medio", clienteNovo: true, tituloFormado: false }).modalidade).toBe("misto");
    expect(sugerirModalidade({ proveito: "medio", tese: "solida", liquidezCliente: "com_caixa", trabalho: "medio", clienteNovo: false, tituloFormado: false }).modalidade).toBe("fixo");
  });
});

describe("extenso", () => {
  it("escreve inteiros, reais e percentuais em português", () => {
    expect(inteiroPorExtenso(0)).toBe("zero");
    expect(inteiroPorExtenso(21)).toBe("vinte e um");
    expect(inteiroPorExtenso(100)).toBe("cem");
    expect(inteiroPorExtenso(115)).toBe("cento e quinze");
    expect(inteiroPorExtenso(1000)).toBe("mil");
    expect(inteiroPorExtenso(2500)).toBe("dois mil e quinhentos");
    expect(inteiroPorExtenso(10712)).toBe("dez mil, setecentos e doze");
    expect(inteiroPorExtenso(1_000_000)).toBe("um milhão");
    expect(inteiroPorExtenso(2_300_045)).toBe("dois milhões, trezentos mil e quarenta e cinco");
    expect(reaisPorExtenso(10712.56)).toBe("dez mil, setecentos e doze reais e cinquenta e seis centavos");
    expect(reaisPorExtenso(1)).toBe("um real");
    expect(reaisPorExtenso(0.01)).toBe("um centavo");
    expect(reaisPorExtenso(0)).toBe("zero reais");
    expect(percentualPorExtenso(20)).toBe("vinte por cento");
    expect(percentualPorExtenso(12.5)).toBe("doze vírgula cinquenta por cento");
    expect(() => inteiroPorExtenso(-1)).toThrow();
  });
});

describe("ramos restantes do cálculo", () => {
  it("rubrica só em URH usa 20% de êxito por padrão; proveito zero vale como desconhecido", () => {
    const ms = calcularHonorarios({ rubricas: ["XVI.mandado_seguranca"], proveitoEconomico: 50_000, complexidade: "baixa", hoje: HOJE }, tabela);
    expect(ms.percentual).toBeNull();
    expect(ms.modalidades.find((m) => m.tipo === "exito")?.percentual).toBe(20);
    const zero = calcularHonorarios({ rubricas: ["IX.ordinario"], proveitoEconomico: 0, complexidade: "baixa", hoje: HOJE }, tabela);
    expect(zero.alertas).toContain("proveito_desconhecido");
    expect(zero.tetoArt50).toBeNull();
  });

  it("duas cautelares satisfativas registram o alerta uma vez; item sem múltiplo nem mínimo vale zero URH", () => {
    const r = calcularHonorarios({ rubricas: ["VIII.cautelar", "VIII.notificacao"], proveitoEconomico: 1000, complexidade: "baixa", cautelarSatisfativa: true, hoje: HOJE }, tabela);
    expect(r.alertas.filter((a) => a === "cautelar_satisfativa")).toHaveLength(1);
    expect(r.piso.urh).toBe(9);
    const estranha: TabelaHonorarios = { ...tabela, itens: [{ codigo: "Z.zero", secao: "Z", item: "sem base", multiploUrh: null, percentual: 10, minimoUrh: null }] };
    const z = calcularHonorarios({ rubricas: ["Z.zero"], proveitoEconomico: 1000, complexidade: "baixa", hoje: HOJE }, estranha);
    expect(z.piso.urh).toBe(0);
    expect(z.sugerido).toBe(100);
  });
});
