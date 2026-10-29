import { ouLacuna } from "../marcadores";
import type { DadosProcuracao } from "./dados";
import { qualificacaoCliente, qualificacaoEscritorio } from "./qualificacao";

/**
 * Procuração ad judicia et extra (assets/procuracao.md): poderes em parágrafo único corrido; os específicos do
 * caso entram no meio, em destaque. Contatos do outorgante conforme a decisão da advogada (política antifraude).
 */
export function procuracaoMarkdown(d: DadosProcuracao): string {
  const orgaos = d.orgaosDoCaso ? ` (em especial ${d.orgaosDoCaso})` : "";
  const especificos = d.poderesEspecificos.length ? `, **${d.poderesEspecificos.join("**, **")}**` : "";
  const quem = d.cliente.tipoPessoa === "juridica" ? "representá-la" : "representá-lo(a)";
  return [
    "# PROCURAÇÃO AD JUDICIA ET EXTRA",
    "",
    `**Outorgante:** ${qualificacaoCliente(d.cliente, { contatos: d.contatos, timbre: d.timbre })}`,
    "",
    `**Outorgada:** ${qualificacaoEscritorio(d.timbre, { comContatos: true })}.`,
    "",
    `**Poderes:** para o fim **especial** de ${quem} ativa e passivamente em juízo ou fora dele, em qualquer instância, tribunal ou órgão administrativo${orgaos}, com **poderes da cláusula *ad judicia et extra*** e os poderes especiais do **art. 105 do Código de Processo Civil**, para propor, acompanhar, **receber citação**, contestar, reconvir, recorrer, **confessar, reconhecer a procedência do pedido**, desistir, **renunciar ao direito sobre o qual se funda a ação**, transigir, firmar compromissos, **celebrar acordos**, **firmar declaração de hipossuficiência econômica**, receber e dar quitação, inclusive de RPVs e precatórios, indicando conta bancária da OUTORGADA para transferência, requerer alvarás, certidões e vista de processos, **requerer tutelas de urgência e medidas cautelares**${especificos}, **requerer e acessar informações e documentos**, promover **execução e cumprimento de sentença**, praticando todos os atos necessários ao fiel cumprimento do presente mandato, podendo **substabelecer**, com ou sem reserva de poderes, na forma do art. 26 da Lei nº 8.906/94.`,
    "",
    `${ouLacuna(d.cliente.cidade, "município")}/${ouLacuna(d.cliente.uf, "UF")}, ${d.dataPorExtenso}.`,
    "",
    "",
    `**${d.cliente.nome.toUpperCase()}**`,
    d.cliente.tipoPessoa === "juridica" ? `por ${ouLacuna(d.cliente.representante, "representante legal")}` : "Outorgante",
    "",
  ].join("\n");
}

/** Poderes específicos por matéria (assets/procuracao.md): o código oferece; a advogada escolhe. */
export const PODERES_POR_MATERIA: Record<string, { rotulo: string; texto: string }> = {
  grupo_economico: { rotulo: "Empresarial / grupo econômico", texto: "propor ação judicial em face das pessoas jurídicas integrantes do grupo econômico responsável, bem como demais pessoas jurídicas coligadas, controladas ou sob direção comum, requerendo sua responsabilização solidária, inclusão no polo passivo e, se necessário, a instauração do Incidente de Desconsideração da Personalidade Jurídica (IDPJ)" },
  cautelares_patrimoniais: { rotulo: "Cautelares patrimoniais", texto: "inclusive arresto, penhora, indisponibilidade de bens e averbações, penhora de quotas sociais e faturamento" },
  fazenda_publica: { rotulo: "Fazenda Pública / servidor", texto: "representar perante os órgãos da Administração Pública, requerer e levantar RPV e precatório, habilitar crédito e requerer o destaque de honorários contratuais na forma do art. 22, §4º, da Lei nº 8.906/94" },
  sucessoes: { rotulo: "Sucessões", texto: "representar em inventário, arrolamento e partilha, assinar escritura pública de inventário, partilha e adjudicação, requerer alvará judicial" },
  familia: { rotulo: "Família", texto: "representar em audiência de conciliação e mediação, requerer e transigir sobre alimentos, guarda e regime de convivência" },
  imobiliario: { rotulo: "Imobiliário", texto: "assinar escritura pública de compra e venda, representar perante Cartório de Registro de Imóveis, requerer averbação e retificação de registro" },
  previdenciario: { rotulo: "Previdenciário", texto: "requerer benefícios perante o INSS, acessar CNIS e Meu INSS, interpor recursos administrativos" },
  anulatorias: { rotulo: "Anulatórias e vícios do processo", texto: "propor ações anulatórias e querela nullitatis" },
};
