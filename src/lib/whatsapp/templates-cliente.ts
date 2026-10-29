import { componentesCorpo, type EnvioTemplate } from "./cliente";
import { sanitizarVariavel } from "./templates";

/**
 * Textos ao cliente (lote 14). Dois tipos:
 * - Respostas fixas (leitura de andamento, aviso de horário, pedido de contato): texto pronto, sem IA.
 *   Sempre começam pela identificação de assistente de IA.
 * - Template da Meta, usado só fora da janela de 24 h: "Mensagem do escritório {{1}}: {{2}}".
 *
 * Nada aqui inventa prazo, horário ou número de contato: o horário vem da configuração do escritório e,
 * quando não existe, o texto diz que a equipe responde assim que possível.
 * Textos marcados com APROVACAO_META dependem de aprovação do template na Meta.
 */

export const APROVACAO_META = "(a confirmar: aprovação do template na Meta)";

export const TEMPLATE_RESPOSTA_ESCRITORIO = {
  nome: "resposta_escritorio",
  categoria: "UTILITY",
  idioma: "pt_BR",
  corpo: "Mensagem do escritório {{1}}: {{2}}",
  quantidadeVariaveis: 2,
  aprovacao: APROVACAO_META,
  descricao: "Resposta aprovada por pessoa, enviada fora da janela de 24 h.",
} as const;

export function identificacao(nomeEscritorio: string): string {
  return `Sou a assistente virtual (IA) do escritório ${nomeEscritorio}.`;
}

/** Prefixa a identificação de IA em qualquer texto automático. */
export function comIdentificacao(nomeEscritorio: string, texto: string): string {
  return `${identificacao(nomeEscritorio)}\n${texto}`;
}

export const TEXTOS_FIXOS = {
  naoVerificado: "Seu número ainda não foi confirmado pelo escritório. Procure a equipe para confirmar seu contato.",
  codigoRecebido: "Número confirmado. A equipe vai registrar sua autorização para receber mensagens deste número.",
  codigoInvalido: "Não reconheci o código. Peça um novo código à equipe.",
  somenteTexto: "Só consigo ler mensagens de texto por aqui. Pode escrever o que precisa?",
  saudacao: "Olá! Posso informar o andamento do seu processo ou encaminhar seu pedido para a equipe.",
  recebido: "Recebemos sua mensagem. A equipe vai responder em breve.",
  foraDoEscopo: "Isso eu não consigo responder por aqui. Vou encaminhar seu pedido para a equipe.",
  semProcesso: "Não encontrei processo em seu nome. A equipe pode ajudar a confirmar.",
  variosProcessos: "Encontrei mais de um processo em seu nome. Para os detalhes, a equipe vai responder.",
  processoSigiloso: "Seu processo corre em segredo de justiça, por isso não posso informar detalhes por aqui. A equipe vai entrar em contato.",
  semMovimento: "Ainda não há movimentação registrada no seu processo. A equipe acompanha e avisa quando houver novidade.",
  ultimaMovimentacao: (dataBr: string) => `A última movimentação registrada no seu processo é de ${dataBr}. Para detalhes, a equipe responde.`,
  encaminhadoAdvogado: "Registrei seu pedido de contato. Alguém da equipe vai falar com você.",
} as const;

/** Aviso de horário: com horário configurado, informa a faixa; sem configuração, não promete hora nenhuma. */
export function textoForaDoHorario(horario: { inicio: string | null; fim: string | null }): string {
  if (horario.inicio && horario.fim) {
    return `Recebemos sua mensagem fora do horário de atendimento (das ${horario.inicio.slice(0, 5)} às ${horario.fim.slice(0, 5)}). A equipe responde no próximo horário de atendimento.`;
  }
  return TEXTOS_FIXOS.recebido;
}

/** Data ISO (YYYY-MM-DD) para DD/MM/AAAA, sem depender de fuso. */
export function dataBr(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Corpo do template de resposta: uma linha só, sem tabulação nem excesso de espaços (regra da Meta). */
export function montarEnvioRespostaEscritorio(nomeEscritorio: string, texto: string): EnvioTemplate {
  const limpo = sanitizarVariavel(texto.replace(/\s+/g, " ").trim().slice(0, 600));
  return { nome: TEMPLATE_RESPOSTA_ESCRITORIO.nome, idioma: TEMPLATE_RESPOSTA_ESCRITORIO.idioma, componentes: componentesCorpo([sanitizarVariavel(nomeEscritorio), limpo]) };
}
