/**
 * Tabela de Honorários da OAB/MT em múltiplos de URH (fonte única; a migration 0028 é gerada daqui por
 * scripts/db/gerar-seed-tabela-oab.ts). Transcrita de references/tabela-oab-mt.md da skill contratacao-e-honorarios.
 *
 * Regra de leitura: onde há percentual E mínimo em URH, vale o MAIOR dos dois; o percentual incide sobre o
 * proveito econômico real. Vigência e URH abaixo; a tabela de 2027 entra como nova linha em ref.tabelas_honorarios.
 */

export const TABELA_OAB_MT_VIGENCIA = "2026-03-12";
export const TABELA_OAB_MT_URH = 1339.07;
export const TABELA_OAB_MT_FONTE = "Tabela de Honorários 2026 da OAB/MT (references/tabela-oab-mt.md da skill; URL oficial a confirmar)";

export interface ItemTabelaOab {
  /** Código estável: <secao>.<slug>. */
  codigo: string;
  secao: string;
  item: string;
  /** Valor fixo em URH (quando não há percentual). */
  multiploUrh: number | null;
  /** Percentual sobre o proveito econômico (0..100). */
  percentual: number | null;
  /** Mínimo em URH quando há percentual. */
  minimoUrh: number | null;
  observacao?: string;
}

const fixo = (codigo: string, secao: string, item: string, urh: number, observacao?: string): ItemTabelaOab => ({ codigo, secao, item, multiploUrh: urh, percentual: null, minimoUrh: null, observacao });
const pct = (codigo: string, secao: string, item: string, percentual: number, minimoUrh: number, observacao?: string): ItemTabelaOab => ({ codigo, secao, item, multiploUrh: null, percentual, minimoUrh, observacao });

export const ITENS_TABELA_OAB_MT: ItemTabelaOab[] = [
  // I — Consultas e pareceres
  fixo("I.consulta_hora", "I", "Consulta, por hora", 0.5),
  fixo("I.parecer", "I", "Parecer escrito", 5),
  // II — Diligências avulsas
  fixo("II.acompanhar_orgao", "II", "Acompanhar cliente a órgão administrativo, judiciário ou policial", 2),
  fixo("II.exame_processo", "II", "Exame de processo", 2),
  fixo("II.peticao_avulsa", "II", "Petição ou requerimento avulso", 2),
  pct("II.solucao_pendencia", "II", "Intervenção para solução de pendência", 10, 2),
  fixo("II.contrato_documento", "II", "Elaboração de contrato ou documento que crie, modifique ou extinga direitos", 2),
  pct("II.transacao_imobiliaria", "II", "Assessoria em transação imobiliária (sobre a transação)", 2, 2),
  pct("II.incorporacao", "II", "Assessoria ou registro de incorporação imobiliária (sobre o custo)", 1, 2),
  fixo("II.convencao_condominio", "II", "Convenção de condomínio", 3),
  // III — Contratos e atos constitutivos
  fixo("III.assembleia", "III", "Participação em assembleia de condomínio ou sociedade", 2),
  fixo("III.sociedade_civil", "III", "Ato constitutivo — sociedade civil", 3),
  pct("III.sociedade_cotas", "III", "Ato constitutivo — sociedade por cotas (sobre o capital)", 1, 3),
  pct("III.sociedade_anonima", "III", "Ato constitutivo — sociedade anônima (sobre o capital social)", 1, 5),
  fixo("III.marcas_patentes", "III", "Registro de marcas e patentes", 5),
  fixo("III.visto_contrato", "III", "Vistos em contratos comerciais", 1),
  // IV — Viagens
  fixo("IV.diaria", "IV", "Diária profissional", 1, "Diárias e despesas de viagem são independentes dos honorários e antecipadas pelo cliente"),
  // V — Advocacia mensal
  fixo("V.partido_geral", "V", "Advocacia mensal ou de partido — geral (por mês)", 5),
  fixo("V.partido_me_epp", "V", "Advocacia mensal ou de partido — ME e EPP (por mês)", 3),
  // VII — Inquéritos administrativos
  fixo("VII.demissao", "VII", "Defesa em inquérito administrativo em que caiba demissão", 6),
  fixo("VII.demais", "VII", "Defesa em inquérito administrativo — demais casos", 3),
  fixo("VII.recurso", "VII", "Recursos em inquérito administrativo", 3),
  // VIII — Cautelares
  pct("VIII.cautelar", "VIII", "Cautelares específicas ou inominadas", 20, 4, "Havendo ação principal, soma-se a tabela específica; cautelar satisfativa: +50%"),
  fixo("VIII.notificacao", "VIII", "Notificação, interpelação, protesto ou sustação", 2),
  // IX — Ações cíveis (20% salvo indicação)
  pct("IX.sumario", "IX", "Procedimento sumário", 20, 4),
  pct("IX.ordinario", "IX", "Procedimento ordinário", 20, 8),
  pct("IX.possessoria", "IX", "Ação possessória", 20, 8),
  pct("IX.usucapiao", "IX", "Usucapião", 20, 8),
  pct("IX.divisao_demarcacao", "IX", "Divisão ou demarcação", 20, 8, "Cumuladas: +3 URH"),
  pct("IX.nunciacao", "IX", "Nunciação de obra nova", 20, 4),
  pct("IX.popular", "IX", "Ação popular", 20, 8),
  pct("IX.rescisoria", "IX", "Ação rescisória", 20, 8),
  pct("IX.prestacao_contas", "IX", "Prestação de contas", 20, 5),
  pct("IX.embargos_terceiro", "IX", "Embargos de terceiro", 20, 4),
  pct("IX.desapropriacao", "IX", "Desapropriação", 20, 8, "Proveito = diferença entre a oferta e a indenização fixada"),
  pct("IX.reivindicatoria", "IX", "Reivindicatória", 20, 8),
  pct("IX.outras_ordinarias", "IX", "Outras ações ordinárias", 20, 8),
  fixo("IX.jurisdicao_voluntaria", "IX", "Jurisdição voluntária (sem tabela específica)", 3),
  pct("IX.jurisdicao_contenciosa", "IX", "Jurisdição contenciosa (sem tabela específica)", 20, 4),
  fixo("IX.pedido_avulso", "IX", "Outros pedidos avulsos", 3),
  fixo("IX.reconvencao", "IX", "Reconvenção", 3),
  fixo("IX.excecao", "IX", "Exceções em apartado", 3),
  fixo("IX.incidente", "IX", "Outros incidentes", 3),
  fixo("IX.intervencao_terceiros", "IX", "Intervenção de terceiros", 3),
  fixo("IX.litisconsorcio", "IX", "Litisconsórcio e assistência", 4, "Simples adesão: 2 URH"),
  pct("IX.declaratoria", "IX", "Ação declaratória", 20, 4),
  pct("IX.execucao_extrajudicial", "IX", "Execução por quantia certa — título extrajudicial", 20, 2),
  pct("IX.insolvencia", "IX", "Insolvência civil", 20, 8),
  pct("IX.monitoria", "IX", "Ação monitória", 20, 2),
  // X — Inquilinato (20%)
  pct("X.despejo", "X", "Despejo", 20, 4),
  pct("X.revisional_aluguel", "X", "Revisional, arbitramento e reajuste de aluguel", 20, 4),
  pct("X.renovatoria", "X", "Renovatória de locação", 20, 4),
  pct("X.fianca", "X", "Fiança — extinção ou substituição", 20, 2),
  pct("X.consignacao", "X", "Consignação em pagamento", 20, 2),
  // XI — Família e sucessões (5%)
  fixo("XI.suprimento_outorga", "XI", "Suprimento de consentimento de outorga", 2),
  fixo("XI.alvara", "XI", "Outros alvarás", 2),
  fixo("XI.arrolamento_cautelar", "XI", "Arrolamento de bens (cautelar)", 5),
  fixo("XI.busca_apreensao_menores", "XI", "Busca e apreensão de crianças/adolescentes ou bens", 5),
  fixo("XI.guarda_provisoria", "XI", "Guarda provisória", 5),
  fixo("XI.separacao_corpos", "XI", "Separação de corpos", 5),
  fixo("XI.adocao_maiores", "XI", "Adoção de maiores", 5),
  fixo("XI.adocao_menores", "XI", "Adoção de menores", 7),
  fixo("XI.reconhecimento_filho_judicial", "XI", "Reconhecimento de filhos — judicial", 4),
  fixo("XI.tutela_guarda", "XI", "Tutela e guarda em juízo", 4),
  fixo("XI.poder_familiar", "XI", "Suspensão/extinção do poder familiar", 6),
  fixo("XI.interdicao", "XI", "Interdição", 6),
  fixo("XI.divorcio_amigavel", "XI", "Divórcio amigável", 5),
  pct("XI.divorcio_litigioso", "XI", "Divórcio litigioso", 5, 8, "Reconvenção: +3 URH"),
  fixo("XI.divorcio_extrajudicial", "XI", "Divórcio extrajudicial sem partilha", 4, "Com partilha: +5% do proveito"),
  fixo("XI.alimentos", "XI", "Alimentos e incidentes", 5),
  fixo("XI.execucao_alimentos", "XI", "Execução de alimentos", 2),
  fixo("XI.guarda", "XI", "Guarda de menores", 6),
  fixo("XI.visitas", "XI", "Regulamentação de visitas", 4),
  fixo("XI.alienacao_parental", "XI", "Alienação parental", 5),
  fixo("XI.investigacao_paternidade", "XI", "Investigação de paternidade", 6),
  fixo("XI.negatoria_paternidade", "XI", "Negatória de paternidade", 8),
  pct("XI.testamento", "XI", "Testamento — registro e inscrição", 5, 8),
  pct("XI.arrolamento", "XI", "Arrolamento", 5, 6),
  pct("XI.inventario", "XI", "Inventário e partilha", 5, 4),
  pct("XI.habilitacao_credito_inventario", "XI", "Habilitação de crédito em inventário", 5, 6),
  fixo("XI.inventario_negativo", "XI", "Inventário negativo", 2),
  pct("XI.assistencia_inventario", "XI", "Assistência em inventário (inventariante, cônjuge, herdeiro único)", 2.5, 4),
  pct("XI.sobrepartilha", "XI", "Retificação, nulidade ou sobrepartilha", 5, 6),
  fixo("XI.outras_familia", "XI", "Outras atividades no foro de família", 2),
  // XII — Falência e recuperação
  fixo("XII.recuperacao_judicial", "XII", "Recuperação judicial", 5),
  fixo("XII.habilitacao_credito", "XII", "Habilitação de crédito", 3),
  fixo("XII.pedido_falencia", "XII", "Pedido de falência", 5),
  // XIV — Fiscal (20%, mín. 5)
  pct("XIV.administrativo", "XIV", "Advocacia fiscal — foro administrativo", 20, 5),
  pct("XIV.judicial", "XIV", "Advocacia fiscal — judicial e anulatória", 20, 5),
  // XV — Previdenciária
  pct("XV.administrativa", "XV", "Previdenciária — postulação administrativa", 20, 3, "Teto: 50% do acumulado pretérito; desconto futuro até 30 vencimentos"),
  pct("XV.judicial", "XV", "Previdenciária — postulação judicial", 20, 5, "Teto: 50% do acumulado pretérito; desconto futuro até 30 vencimentos"),
  // XVI — Mandado de segurança
  fixo("XVI.mandado_seguranca", "XVI", "Mandado de segurança, injunção e habeas data", 7),
  // XVII — Trabalhista (30%)
  pct("XVII.reclamatoria_sumarissimo", "XVII", "Reclamatória trabalhista — rito sumaríssimo", 30, 2),
  pct("XVII.reclamatoria_ordinario", "XVII", "Reclamatória trabalhista — rito ordinário", 30, 3),
  pct("XVII.defesa_ordinario", "XVII", "Defesa trabalhista — rito ordinário", 30, 4),
  // XIX — Criminal (seleção)
  fixo("XIX.inquerito", "XIX", "Acompanhamento de inquérito", 5),
  fixo("XIX.processo_ordinario", "XIX", "Processo criminal ordinário", 10),
  fixo("XIX.juri", "XIX", "Júri — todo o procedimento até sustentação", 30),
  fixo("XIX.liberdade_provisoria", "XIX", "Liberdade provisória, revogação de preventiva, cautelares", 5),
  fixo("XIX.hc", "XIX", "HC, MS ou recurso ordinário constitucional", 6),
  // XXI — Tribunais
  fixo("XXI.originaria", "XXI", "Ação de competência originária", 15),
  fixo("XXI.rescisoria", "XXI", "Ação rescisória (tribunal)", 15),
  fixo("XXI.razoes_recurso", "XXI", "Razões e contrarrazões de qualquer recurso", 9),
  fixo("XXI.memorial", "XXI", "Memorial", 5),
  fixo("XXI.sustentacao_oral", "XXI", "Sustentação oral", 9),
  fixo("XXI.acompanhamento_recurso", "XXI", "Simples acompanhamento de recurso", 2),
  fixo("XXI.agravo_instrumento", "XXI", "Agravo de instrumento", 4),
  // XXII — Juizados
  pct("XXII.inicial_contestacao", "XXII", "Juizados Especiais — pedido inicial ou contestação", 20, 2),
  pct("XXII.recurso", "XXII", "Juizados Especiais — recursos", 10, 1),
  pct("XXII.embargos", "XXII", "Juizados Especiais — embargos (execução)", 10, 2),
  // XXIV — Audiências
  fixo("XXIV.instrucao", "XXIV", "Audiência de instrução (estadual/federal/trabalho)", 1.5),
  fixo("XXIV.preliminar", "XXIV", "Audiência preliminar ou de conciliação", 0.5),
  // XXVII — Hora técnica
  fixo("XXVII.hora_tecnica", "XXVII", "Hora técnica de trabalho", 0.5),
];

export function itemTabelaOab(codigo: string): ItemTabelaOab | undefined {
  return ITENS_TABELA_OAB_MT.find((i) => i.codigo === codigo);
}
