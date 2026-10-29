import { componentesCorpo, type EnvioTemplate } from "./cliente";

/**
 * Templates de mensagem do MVP (WhatsApp Cloud API).
 *
 * REGRA DA JANELA: fora da janela de 24 h aberta pela última mensagem do
 * usuário, só é permitido enviar template aprovado pela Meta (categoria
 * utility, não promocional). Dentro da janela, texto livre é permitido (e, a
 * partir de 01/10/2026, cobrado após 1.000 mensagens de serviço por número/mês).
 * Resumo do dia e alertas são iniciados pelo sistema, logo saem sempre como
 * template. Ver docs/escopo-revisado.md 1.3.4 e Apêndice A.5.
 *
 * Os textos abaixo são a SUGESTÃO para submissão à Meta; o texto aprovado é o
 * que vale e deve ser copiado de volta para cá após a aprovação (a confirmar).
 * Restrições conhecidas dos parâmetros: sem quebra de linha, tabulação ou mais
 * de 4 espaços seguidos; variáveis sequenciais ({{1}}, {{2}}...). Para não
 * arriscar rejeição, nenhum corpo começa nem termina com variável (a confirmar
 * se a Meta ainda aplica essa restrição).
 *
 * Sigilo: nunca enviar texto de processo sigiloso; para esses, a variável de
 * resumo recebe um aviso genérico e o usuário consulta o painel.
 */

export const TEMPLATES = {
  resumoDoDia: "resumo_do_dia",
  alertaPrazo: "alerta_prazo",
  novaPublicacao: "nova_publicacao",
  tarefaReatribuida: "tarefa_reatribuida",
  publicacaoSemTratamento: "publicacao_sem_tratamento",
} as const;

export type NomeTemplate = (typeof TEMPLATES)[keyof typeof TEMPLATES];

export const IDIOMA_TEMPLATES = "pt_BR";
export const CATEGORIA_TEMPLATES = "UTILITY";

export interface DefinicaoTemplate {
  nome: NomeTemplate;
  categoria: typeof CATEGORIA_TEMPLATES;
  idioma: typeof IDIOMA_TEMPLATES;
  /** Texto sugerido para o corpo, com placeholders {{1}}, {{2}}... */
  corpo: string;
  /** Quantidade de variáveis do corpo. */
  quantidadeVariaveis: number;
  /** Exemplos de valores exigidos pela Meta na submissão. */
  exemplo: string[];
  /** Quando usar. */
  descricao: string;
}

export const DEFINICOES_TEMPLATES: Record<NomeTemplate, DefinicaoTemplate> = {
  resumo_do_dia: {
    nome: "resumo_do_dia",
    categoria: "UTILITY",
    idioma: "pt_BR",
    corpo:
      "Bom dia, {{1}}! Resumo de {{2}}:\n" +
      "📄 {{3}} publicação(ões) nova(s)\n" +
      "⏰ {{4}} prazo(s) hoje e {{5}} amanhã\n" +
      "📌 {{6}} tarefa(s) atrasada(s)\n" +
      "Painel: {{7}}\n" +
      "Responda aqui para consultar prazos, publicações e tarefas.",
    quantidadeVariaveis: 7,
    exemplo: ["Ana", "quarta-feira, 28/10/2026", "3", "1", "2", "0", "https://painel.exemplo.com.br/dia"],
    descricao: "Enviado a cada usuário ativo às 07:30 (fuso do escritório) em dias úteis.",
  },
  alerta_prazo: {
    nome: "alerta_prazo",
    categoria: "UTILITY",
    idioma: "pt_BR",
    corpo:
      "Alerta de prazo: {{1}} no processo {{2}} vence {{3}} ({{4}}).\n" +
      "Confira a tarefa no painel. Se já foi protocolado, marque o prazo como cumprido.",
    quantidadeVariaveis: 4,
    exemplo: ["Contestação", "0001234-56.2026.8.11.0041", "em 3 dias", "02/11/2026"],
    descricao: "Enviado em D-3 e D-1 ao responsável, em D0 e ao vencer (prazo_vencido) ao responsável e aos sócios.",
  },
  nova_publicacao: {
    nome: "nova_publicacao",
    categoria: "UTILITY",
    idioma: "pt_BR",
    corpo:
      "Nova publicação no processo {{1}} ({{2}}).\n" +
      "{{3}}\n" +
      "Veja no painel: {{4}} e trate a publicação (confirmar prazo, sem prazo ou ignorar).",
    quantidadeVariaveis: 4,
    exemplo: [
      "0001234-56.2026.8.11.0041",
      "DJEN de 28/10/2026",
      "Intimação para manifestação sobre documentos em 15 dias.",
      "https://painel.exemplo.com.br/publicacoes/abc",
    ],
    descricao: "Enviado ao responsável assim que uma publicação é vinculada a processo da carteira.",
  },
  tarefa_reatribuida: {
    nome: "tarefa_reatribuida",
    categoria: "UTILITY",
    idioma: "pt_BR",
    corpo:
      "A tarefa \"{{1}}\" do processo {{2}} foi reatribuída para você por {{3}}.\n" +
      "Data interna: {{4}}. Veja os detalhes no painel.",
    quantidadeVariaveis: 4,
    exemplo: ["Elaborar contestação", "0001234-56.2026.8.11.0041", "Dra. Ana", "30/10/2026"],
    descricao: "Enviado ao novo executor da tarefa no momento da reatribuição.",
  },
  publicacao_sem_tratamento: {
    nome: "publicacao_sem_tratamento",
    categoria: "UTILITY",
    idioma: "pt_BR",
    corpo:
      "A publicação do processo {{1}} está há {{2}} horas úteis sem tratamento.\n" +
      "Responsável: {{3}}. Confirme o prazo ou registre o motivo no painel: {{4}} (o alerta se repete aos sócios após 48 horas úteis).",
    quantidadeVariaveis: 4,
    exemplo: ["0001234-56.2026.8.11.0041", "24", "Dr. Bruno", "https://painel.exemplo.com.br/publicacoes/abc"],
    descricao: "Enviado ao responsável após 24 h úteis sem tratamento e aos sócios após 48 h úteis.",
  },
};

/** Remove o que a Meta rejeita em parâmetros: quebras de linha, tabulações e espaços repetidos. */
export function sanitizarVariavel(valor: string | number): string {
  const texto = String(valor).replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return texto.length > 0 ? texto : "-";
}

/** Formata YYYY-MM-DD como DD/MM/YYYY; devolve a entrada se não casar com o padrão. */
export function formatarDataBR(dataISO: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataISO);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dataISO;
}

/** "hoje", "amanhã", "em N dias" ou "vencido há N dia(s)". */
export function descreverDiasRestantes(diasRestantes: number): string {
  if (diasRestantes === 0) return "hoje";
  if (diasRestantes === 1) return "amanhã";
  if (diasRestantes > 1) return `em ${diasRestantes} dias`;
  const atraso = Math.abs(diasRestantes);
  return atraso === 1 ? "vencido há 1 dia" : `vencido há ${atraso} dias`;
}

export interface DadosResumoDoDia {
  nome: string;
  /** Data por extenso ou DD/MM/YYYY, já no fuso do escritório. */
  dataLocal: string;
  publicacoesNovas: number;
  prazosHoje: number;
  prazosAmanha: number;
  tarefasAtrasadas: number;
  linkPainel: string;
}

export function variaveisResumoDoDia(d: DadosResumoDoDia): string[] {
  return [
    d.nome,
    d.dataLocal,
    d.publicacoesNovas,
    d.prazosHoje,
    d.prazosAmanha,
    d.tarefasAtrasadas,
    d.linkPainel,
  ].map(sanitizarVariavel);
}

export interface DadosAlertaPrazo {
  /** Nome do ato (ex.: "Contestação"). */
  ato: string;
  /** Número CNJ com máscara. */
  processoMascara: string;
  /** Data final em YYYY-MM-DD. */
  dataFinal: string;
  /** Dias (corridos) até a data final: 3, 1, 0. */
  diasRestantes: number;
}

/**
 * Variáveis do template `alerta_prazo`, cujo corpo diz "... vence {{3}} ({{4}})". Para D-3, D-1 e D0 a
 * variável 3 é "em 3 dias", "amanhã" ou "hoje". Para prazo já vencido (evento prazo_vencido, diasRestantes < 0)
 * o mesmo template é reaproveitado: a variável 3 vira "— já vencido há N dia(s)", que lê bem depois de "vence"
 * sem exigir outro template aprovado pela Meta.
 */
export function variaveisAlertaPrazo(d: DadosAlertaPrazo): string[] {
  const quando = d.diasRestantes < 0 ? `— já ${descreverDiasRestantes(d.diasRestantes)}` : descreverDiasRestantes(d.diasRestantes);
  return [d.ato, d.processoMascara, quando, formatarDataBR(d.dataFinal)].map(sanitizarVariavel);
}

export interface DadosNovaPublicacao {
  processoMascara: string;
  /** Origem e data, ex.: "DJEN de 28/10/2026". */
  origem: string;
  /** Resumo curto gerado pela IA; ignorado quando sigiloso. */
  resumo?: string | null;
  sigiloso: boolean;
  linkPainel: string;
}

export const AVISO_SIGILOSO = "Conteúdo restrito ao responsável e aos sócios; consulte no painel.";

export function variaveisNovaPublicacao(d: DadosNovaPublicacao): string[] {
  const resumo = d.sigiloso ? AVISO_SIGILOSO : d.resumo && d.resumo.trim() ? d.resumo : "Veja o teor no painel.";
  return [d.processoMascara, d.origem, resumo, d.linkPainel].map(sanitizarVariavel);
}

export interface DadosTarefaReatribuida {
  tarefa: string;
  processoMascara: string;
  reatribuidaPor: string;
  /** YYYY-MM-DD. */
  dataInterna: string;
}

export function variaveisTarefaReatribuida(d: DadosTarefaReatribuida): string[] {
  return [d.tarefa, d.processoMascara, d.reatribuidaPor, formatarDataBR(d.dataInterna)].map(sanitizarVariavel);
}

export interface DadosPublicacaoSemTratamento {
  processoMascara: string;
  horasUteis: number;
  responsavelNome: string;
  linkPainel: string;
}

export function variaveisPublicacaoSemTratamento(d: DadosPublicacaoSemTratamento): string[] {
  return [d.processoMascara, Math.floor(d.horasUteis), d.responsavelNome, d.linkPainel].map(sanitizarVariavel);
}

/** Substitui {{n}} pelo valor correspondente; útil para gravar o texto renderizado na fila de envio. */
export function renderizarTemplate(nome: NomeTemplate, variaveis: string[]): string {
  const definicao = DEFINICOES_TEMPLATES[nome];
  if (variaveis.length !== definicao.quantidadeVariaveis) {
    throw new Error(
      `Template ${nome} espera ${definicao.quantidadeVariaveis} variáveis, recebeu ${variaveis.length}`,
    );
  }
  return definicao.corpo.replace(/\{\{(\d+)\}\}/g, (_, indice: string) => variaveis[Number(indice) - 1] ?? "");
}

/** Monta o objeto que `ClienteWhatsapp.enviarTemplate` recebe. */
export function montarEnvioTemplate(nome: NomeTemplate, variaveis: string[]): EnvioTemplate {
  const definicao = DEFINICOES_TEMPLATES[nome];
  if (variaveis.length !== definicao.quantidadeVariaveis) {
    throw new Error(
      `Template ${nome} espera ${definicao.quantidadeVariaveis} variáveis, recebeu ${variaveis.length}`,
    );
  }
  return { nome, idioma: definicao.idioma, componentes: componentesCorpo(variaveis) };
}
