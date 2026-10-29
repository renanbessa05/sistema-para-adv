import { z } from "zod";

/**
 * Saídas estruturadas das seis etapas do Modo C (skill tjmt-peticoes) e da varredura. Cada etapa devolve o texto
 * em Markdown (o que a advogada lê e aprova) e campos tabulares que o sistema usa nas etapas seguintes e na
 * validação. Lacunas sempre com o marcador único [[VERIFICAR: motivo]].
 */

export const TIPOS_PECA = ["inicial", "contestacao", "replica", "agravo_instrumento", "apelacao", "contrarrazoes", "embargos_declaracao", "cumprimento_sentenca", "impugnacao", "peticao_intermediaria", "mandado_seguranca", "outro"] as const;
export const AREAS = ["civel", "empresarial", "consumidor", "administrativo_servidores", "agrario_ambiental", "familia_sucessoes", "outra"] as const;
export type TipoPeca = (typeof TIPOS_PECA)[number];
export type AreaDireito = (typeof AREAS)[number];

export const ROTULO_TIPO_PECA: Record<TipoPeca, string> = {
  inicial: "Petição inicial",
  contestacao: "Contestação",
  replica: "Réplica",
  agravo_instrumento: "Agravo de instrumento",
  apelacao: "Apelação",
  contrarrazoes: "Contrarrazões",
  embargos_declaracao: "Embargos de declaração",
  cumprimento_sentenca: "Cumprimento de sentença",
  impugnacao: "Impugnação",
  peticao_intermediaria: "Petição intermediária",
  mandado_seguranca: "Mandado de segurança",
  outro: "Outra",
};
export const ROTULO_AREA: Record<AreaDireito, string> = {
  civel: "Cível",
  empresarial: "Empresarial",
  consumidor: "Consumidor",
  administrativo_servidores: "Administrativo / servidores MT",
  agrario_ambiental: "Agrário e ambiental",
  familia_sucessoes: "Família e sucessões",
  outra: "Outra",
};

const base = { conteudo_md: z.string().describe("Texto completo da etapa em Markdown, como a advogada vai ler"), lacunas: z.array(z.string().max(200)).max(20).describe("O que ficou marcado [[VERIFICAR: …]]"), pendencias: z.array(z.string().max(200)).max(10).describe("O que ficou pendente para a próxima etapa") };

export const Etapa1Schema = z.object({
  ...base,
  linha_do_tempo: z.array(z.object({ data: z.string().max(40), fato: z.string().max(300), documento: z.string().max(120).nullable(), origem: z.string().max(120).nullable() })).max(60),
  partes: z.array(z.object({ nome: z.string().max(200), papel: z.string().max(80), qualificacao: z.string().max(300).nullable(), observacao: z.string().max(200).nullable() })).max(12),
  conflito: z.string().max(600),
  acontecimentos_juridicos: z.array(z.string().max(200)).max(12),
  travam_ajuizamento: z.array(z.string().max(200)).max(12),
  completar_depois: z.array(z.string().max(200)).max(12),
});

export const Etapa2Schema = z.object({
  ...base,
  teses: z.array(z.object({
    nome: z.string().max(160),
    enquadramento: z.string().max(300).describe("Artigo + lei por extenso"),
    requisitos: z.array(z.string().max(200)).max(10),
    fatos_que_sustentam: z.array(z.string().max(200)).max(10),
    pontos_fortes: z.array(z.string().max(200)).max(6),
    fragilidades: z.array(z.string().max(200)).max(6),
    riscos: z.array(z.string().max(200)).max(6),
    solidez: z.enum(["solida", "arriscada", "fraca"]),
    tipo: z.enum(["material", "processual"]),
  })).min(1).max(12),
  ranking: z.array(z.string().max(160)).max(12).describe("Nomes das teses, da mais sólida para a menos"),
});

export const Etapa3Schema = z.object({
  ...base,
  fatos_provas: z.array(z.object({ fato: z.string().max(300), prova: z.string().max(300).nullable(), classificacao: z.enum(["documentado", "prova_fragil", "a_comprovar"]), providencia: z.string().max(300).nullable() })).min(1).max(60),
  provas_adicionais: z.array(z.object({ prova: z.string().max(200), caminho: z.string().max(300), depende_de_prazo_ou_terceiro: z.boolean() })).max(20),
});

export const Etapa4Schema = z.object({
  ...base,
  preliminares: z.array(z.object({ tese: z.string().max(200), fundamento: z.string().max(200), resposta_nossa: z.string().max(300).nullable() })).max(12),
  teses_defensivas: z.array(z.object({ tese: z.string().max(200), fundamento: z.string().max(200), resposta_nossa: z.string().max(300).nullable() })).max(12),
  ataque_provas: z.array(z.string().max(300)).max(12),
  contradicoes_internas: z.array(z.string().max(300)).max(8),
  riscos_do_ajuizamento: z.array(z.string().max(300)).max(8),
  mudancas_na_inicial: z.array(z.string().max(300)).min(1).max(12).describe("O produto útil da etapa: o que muda na peça por causa de cada ataque"),
});

export const Etapa5Schema = z.object({
  ...base,
  tese_principal: z.object({ nome: z.string().max(160), razao: z.string().max(400) }),
  teses_subsidiarias: z.array(z.object({ nome: z.string().max(160), razao: z.string().max(300) })).max(8),
  fatos_que_entram: z.array(z.string().max(200)).max(30),
  fatos_que_ficam_fora: z.array(z.object({ fato: z.string().max(200), motivo: z.string().max(200) })).max(12),
  provas_por_fundamento: z.array(z.object({ fundamento: z.string().max(160), provas: z.array(z.string().max(160)).max(8) })).max(12),
  pedidos: z.array(z.object({ tipo: z.enum(["tutela_urgencia", "principal", "subsidiario", "honorarios_custas", "citacao", "provas", "outro"]), texto: z.string().max(400).describe("Verbo no infinitivo") })).min(1).max(20),
  valor_causa: z.object({ valor: z.number().nonnegative().nullable(), criterio: z.string().max(300) }),
  competencia: z.object({ comarca: z.string().max(120).nullable(), vara: z.string().max(160).nullable(), grau: z.enum(["primeiro", "segundo"]), rito: z.string().max(120).nullable(), custas_ou_gratuidade: z.string().max(200).nullable() }),
});

export const Etapa6Schema = z.object({
  conteudo_md: z.string().describe("A peça completa em Markdown, pronta para o PJe, com [[VERIFICAR: …]] onde faltar dado"),
  ementa_informal: z.string().max(400),
  checklist: z.array(z.object({ item: z.string().max(160), situacao: z.enum(["ok", "atencao", "falta"]), observacao: z.string().max(200).nullable() })).max(30),
  alertas: z.array(z.string().max(300)).max(20),
  classificacao_pje: z.object({ tipo_documento: z.string().max(120), assunto_tpu: z.string().max(200) }),
  citacoes_jurisprudencia: z.array(z.object({ referencia: z.string().max(300), confirmada_na_base: z.boolean(), id_base: z.string().max(80).nullable() })).max(30),
  documentos_citados: z.array(z.string().max(40)).max(60).describe("Rótulos 'Doc. NN' usados no texto"),
});

export type Etapa1 = z.infer<typeof Etapa1Schema>;
export type Etapa2 = z.infer<typeof Etapa2Schema>;
export type Etapa3 = z.infer<typeof Etapa3Schema>;
export type Etapa4 = z.infer<typeof Etapa4Schema>;
export type Etapa5 = z.infer<typeof Etapa5Schema>;
export type Etapa6 = z.infer<typeof Etapa6Schema>;

export const ESQUEMAS_ETAPAS = { 1: Etapa1Schema, 2: Etapa2Schema, 3: Etapa3Schema, 4: Etapa4Schema, 5: Etapa5Schema, 6: Etapa6Schema } as const;
export const TITULO_ETAPA: Record<number, string> = { 1: "Fatos, partes e lacunas", 2: "Teses juridicamente aplicáveis", 3: "Fatos × provas", 4: "Advogado da futura parte contrária", 5: "Estratégia da peça", 6: "Redação" };

// Varredura dos autos (skill varredura-de-oportunidades)
export const PontoVarreduraSchema = z.object({
  numero: z.number().int().min(1),
  titulo: z.string().max(200),
  eixo: z.enum(["A", "B", "C", "D", "E", "F"]),
  fundamento: z.string().max(400),
  onde_nos_autos: z.string().max(300).describe("Peça, ID e página"),
  resposta_adversario: z.string().max(400),
  solidez: z.enum(["solida", "arriscada", "inviavel"]),
  prioridade: z.enum(["decisiva", "relevante", "complementar"]),
  risco: z.string().max(300).nullable(),
});
export const VarreduraSchema = z.object({
  conteudo_md: z.string().describe("Parte I completa em Markdown (posição, mapa, pontos, ordem, descartados, lacunas, aviso)"),
  mapa: z.object({
    linha_do_tempo: z.array(z.object({ data: z.string().max(40), ato: z.string().max(300), id: z.string().max(80).nullable() })).max(80),
    ultima_peca_pendente: z.string().max(300).nullable(),
    estado_atual: z.string().max(300),
    teses_das_partes: z.array(z.object({ parte: z.string().max(80), tese: z.string().max(300), impugnada: z.boolean() })).max(30),
    fatos_controvertidos: z.array(z.object({ fato: z.string().max(300), situacao: z.enum(["comprovado", "prova_conflitante", "sem_comprovacao"]), prova: z.string().max(200).nullable() })).max(40),
  }),
  pontos: z.array(PontoVarreduraSchema).max(40),
  ordem_recomendada: z.array(z.number().int()).max(40).describe("Números dos pontos na ordem argumentativa"),
  descartados: z.array(z.object({ numero: z.number().int(), motivo: z.string().max(300) })).max(40),
  lacunas_e_diligencias: z.array(z.string().max(300)).max(20),
  riscos_ma_fe_ou_preclusao: z.array(z.string().max(300)).max(10),
});
export type Varredura = z.infer<typeof VarreduraSchema>;
export type PontoVarredura = z.infer<typeof PontoVarreduraSchema>;

export const EIXOS_VARREDURA: Record<string, string> = { A: "Atos do juízo", B: "Serventia e comunicação processual", C: "Conduta e falhas do adversário", D: "Prova e ônus", E: "Direito material", F: "Procedimento, execução e efeitos econômicos" };
