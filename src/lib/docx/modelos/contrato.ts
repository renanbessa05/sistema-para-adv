import { formatarReais } from "../../honorarios/tabela";
import { percentualPorExtenso, reaisPorExtenso } from "../../honorarios/extenso";
import { ouLacuna } from "../marcadores";
import type { DadosContrato } from "./dados";
import { qualificacaoCliente, qualificacaoEscritorio } from "./qualificacao";

/**
 * Contrato de prestação de serviços advocatícios e honorários contratuais, em Markdown, a partir de
 * assets/contrato-honorarios.md da skill contratacao-e-honorarios. Só o bloco da modalidade confirmada entra na
 * Cláusula Segunda; a Cláusula Terceira (êxito) sai no valor fixo; a 7.2 (gratuidade) entra só quando se pedir.
 * Contatos da CONTRATANTE são os do escritório (política antifraude, item 11 das regras).
 */
export function contratoHonorariosMarkdown(d: DadosContrato): string {
  const h = d.honorarios;
  const linhas: string[] = [];
  const P = (t: string) => linhas.push(t, "");

  P("# CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS E HONORÁRIOS CONTRATUAIS");
  P("Pelo presente instrumento particular, as partes abaixo qualificadas:");
  P(`**CONTRATADA:** ${qualificacaoEscritorio(d.timbre, { comContatos: false })}.`);
  P(`**CONTRATANTE:** ${qualificacaoCliente(d.cliente, { contatos: "escritorio", timbre: d.timbre, papel: "CONTRATANTE" })}`);
  P("Resolvem, de comum acordo e na melhor forma de direito, celebrar o presente Contrato de Prestação de Serviços Advocatícios e Honorários Contratuais, que se regerá pela Lei Federal nº 8.906/94 (Estatuto da Advocacia e da OAB), pelo Código de Ética e Disciplina da OAB, pelo Código Civil, pelo Código de Processo Civil e pelas cláusulas a seguir.");

  P("## CLÁUSULA PRIMEIRA — DO OBJETO");
  const processo = d.objeto.processoCnj ? `processo nº ${d.objeto.processoCnj}, em trâmite perante ${ouLacuna(d.objeto.juizo, "juízo")}` : `a ser distribuída perante ${ouLacuna(d.objeto.juizo, "juízo")}`;
  P(`**1.1.** O objeto consiste na prestação de serviços advocatícios pela CONTRATADA em favor da CONTRATANTE para ${ouLacuna(d.objeto.atuacao, "atuação")} de **${ouLacuna(d.objeto.tipoDemanda, "tipo de demanda")}** em face de **${ouLacuna(d.objeto.parteContraria, "parte contrária")}**, ${processo}, visando a:`);
  const pedidos = d.objeto.pedidos.length ? d.objeto.pedidos : ["[[VERIFICAR: pedido principal]]"];
  pedidos.forEach((p, i) => linhas.push(`${String.fromCharCode(97 + i)}) ${p};`));
  linhas.push("");
  P("**1.2.** A prestação abrange a atuação da CONTRATADA em todas as fases e instâncias do processo, incluindo: a) consultoria e análise estratégica; b) elaboração e protocolo das peças; c) acompanhamento em 1º e 2º graus; d) interposição e acompanhamento de todos os recursos cabíveis, ordinários e extraordinários; e) atuação nas fases de liquidação e cumprimento; e f) acompanhamento das medidas necessárias ao efetivo recebimento dos créditos.");
  P(`**1.3.** Não integram o objeto, salvo aditivo escrito: ${d.objeto.exclusoes ?? "ações conexas, reconvenção, demandas autônomas e atuação em outros juízos"}.`);

  P("## CLÁUSULA SEGUNDA — DOS HONORÁRIOS ADVOCATÍCIOS CONTRATUAIS");
  const urh = h.urhEquivalente !== null && h.urhEquivalente > 0 ? `, correspondente a ${h.urhEquivalente.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} URH da Tabela de Honorários da OAB/MT vigente` : "";
  const valorFixoTxt = h.valorFixo !== null ? `**${formatarReais(h.valorFixo)} (${reaisPorExtenso(h.valorFixo)})**` : "**[[VERIFICAR: valor fixo]]**";
  const percentualTxt = h.percentual !== null ? `**${h.percentual.toLocaleString("pt-BR")}% (${percentualPorExtenso(h.percentual)})**` : "**[[VERIFICAR: percentual de êxito]]**";
  const liquido = `Entende-se por "valor líquido" o montante efetivamente recebido pela CONTRATANTE, após a dedução exclusiva dos descontos legais obrigatórios incidentes sobre o crédito principal${h.descontosLegais ? ` (${h.descontosLegais})` : ""}.`;

  if (h.modalidade === "fixo" || h.modalidade === "fixo_parcelado") {
    P(`**2.1.** A CONTRATANTE pagará à CONTRATADA, a título de honorários advocatícios contratuais, a quantia certa de ${valorFixoTxt}${urh}.`);
    if (h.modalidade === "fixo_parcelado" && h.parcelas && h.parcelas > 1 && h.valorFixo !== null) {
      const parcela = Math.round((h.valorFixo / h.parcelas) * 100) / 100;
      P(`**2.1.1.** O pagamento se dará em ${h.parcelas} (${numeroPorExtensoSimples(h.parcelas)}) parcelas mensais e sucessivas de ${formatarReais(parcela)} (${reaisPorExtenso(parcela)}), vencendo a primeira em ${h.primeiraParcelaEm ? dataBr(h.primeiraParcelaEm) : "[[VERIFICAR: vencimento da primeira parcela]]"} e as demais no dia ${h.diaVencimento ?? "[[VERIFICAR: dia de vencimento]]"} dos meses subsequentes.`);
    } else {
      P("**2.1.1.** O pagamento se dará à vista, na assinatura deste instrumento.");
    }
    P("**2.1.2.** A primeira parcela é devida antes do protocolo da peça inaugural.");
    P("**2.1.3.** O inadimplemento de qualquer parcela acarreta o vencimento antecipado do saldo devedor, acrescido de multa de 10% (dez por cento), juros de mora de 1% (um por cento) ao mês e correção monetária.");
    P("**2.1.4.** Os honorários aqui pactuados são devidos independentemente do resultado da demanda, remunerando o trabalho profissional e não o êxito.");
  } else if (h.modalidade === "exito") {
    P(`**2.1.** A título de remuneração pelo resultado patrimonial, a CONTRATANTE pagará à CONTRATADA honorários de êxito (*ad exitum*) correspondentes a ${percentualTxt} do proveito econômico líquido efetivamente auferido.`);
    P(`**2.1.1.** ${liquido}`);
    const exclusoes = h.exclusoesBase.length ? h.exclusoesBase : ["remuneração mensal regular e futura da CONTRATANTE", "parcelas de natureza indenizatória estranhas ao objeto da ação"];
    P(`**2.2. Exclusões da base de cálculo.** Os honorários da Cláusula 2.1 não incidirão sobre: ${exclusoes.map((e, i) => `(${String.fromCharCode(97 + i)}) ${e}`).join("; e ")}.`);
  } else {
    const parcelado = h.parcelas && h.parcelas > 1 && h.valorFixo !== null ? `em ${h.parcelas} (${numeroPorExtensoSimples(h.parcelas)}) parcelas mensais de ${formatarReais(Math.round((h.valorFixo / h.parcelas) * 100) / 100)}` : "à vista na assinatura";
    P(`**2.1. Honorários iniciais.** A CONTRATANTE pagará à CONTRATADA, a título de honorários iniciais, a quantia de ${valorFixoTxt}, ${parcelado}, devida independentemente do resultado e não restituível.`);
    P(h.abaterEntrada ? "**2.1.1.** Os honorários iniciais serão abatidos dos honorários de êxito, até o limite do valor pago." : "**2.1.1.** Os honorários iniciais **não serão abatidos** dos honorários de êxito previstos na Cláusula 2.2, remunerando trabalho profissional autônomo.");
    P(`**2.2. Honorários de êxito.** Sobrevindo proveito econômico, a CONTRATANTE pagará à CONTRATADA ${percentualTxt} do valor líquido efetivamente auferido, na forma da Cláusula 2.2.1.`);
    P(`**2.2.1.** ${liquido}`);
  }
  P("**Parágrafo único.** As partes declaram ter discutido e compreendido que a CONTRATADA será remunerada de forma **cumulativa** pelos honorários contratuais aqui pactuados e pelos honorários de sucumbência, tendo a CONTRATANTE sido expressamente informada dessa cumulação e com ela concordado.");
  P("**2.3. Honorários de sucumbência.** Os honorários de sucumbência fixados pelo juízo pertencem exclusivamente à CONTRATADA, nos termos do art. 23 da Lei nº 8.906/94, **não se confundindo, não se compensando e não sendo abatidos** dos honorários contratuais.");
  P(`**2.4. Reajuste.** Os valores fixos pactuados serão corrigidos ${h.reajuste}, caso a demanda ultrapasse 12 (doze) meses de duração.`);

  const temExito = h.modalidade === "exito" || h.modalidade === "misto";
  let n = 3;
  if (temExito) {
    P(`## CLÁUSULA ${ORDINAL[n]} — DA CONFIGURAÇÃO DO ÊXITO E DA EXIGIBILIDADE`);
    P(`**${n}.1.** O êxito, para fins de incidência dos honorários contratuais, configura-se com qualquer evento que resulte em proveito econômico para a CONTRATANTE, dentre os quais: a) trânsito em julgado de decisão favorável; b) acordo judicial ou extrajudicial; c) reconhecimento administrativo do direito com pagamento; d) cumprimento provisório ou definitivo de decisão que resulte em pagamento; e e) recebimento de valores por RPV ou precatório.`);
    P(`**${n}.2. Exigibilidade.** A exigibilidade dos honorários de êxito condiciona-se ao efetivo ingresso patrimonial dos valores, tornando-se devidos na mesma data e proporção de cada pagamento recebido pela CONTRATANTE.`);
    P(`**${n}.3. Teto ético.** As partes reconhecem que os honorários contratuais, somados aos de sucumbência, não superarão a vantagem econômica advinda à CONTRATANTE, na forma do art. 50 do Código de Ética e Disciplina da OAB.`);
    n += 1;
  }

  P(`## CLÁUSULA ${ORDINAL[n]} — DO PAGAMENTO E DO DESTAQUE DOS HONORÁRIOS`);
  P(`**${n}.1.** A CONTRATANTE autoriza expressamente a CONTRATADA, nos termos do art. 22, §4º, da Lei nº 8.906/94, a juntar este contrato aos autos para requerer ao juízo o destaque e a expedição de ${d.instrumentoDestaque} autônomo, em nome da sociedade de advocacia, referente aos honorários contratuais. Sobrevindo pagamento parcelado ou fracionado, o destaque dar-se-á na mesma proporção de cada parcela recebida.`);
  P(`**${n}.2.** Caso o destaque não seja deferido ou o pagamento ocorra diretamente à CONTRATANTE, esta repassará à CONTRATADA o valor devido no prazo de 5 (cinco) dias úteis do efetivo recebimento, sob pena de multa de 10% (dez por cento), juros de mora de 1% (um por cento) ao mês e correção monetária.`);
  n += 1;

  P(`## CLÁUSULA ${ORDINAL[n]} — DA REVOGAÇÃO, RENÚNCIA E DESISTÊNCIA`);
  P(`**${n}.1. Revogação do mandato.** Em caso de revogação sem justa causa, isto é, sem culpa ou falha profissional comprovada da CONTRATADA, antes do término da demanda, serão devidos à CONTRATADA honorários proporcionais ao trabalho efetivamente desenvolvido até a revogação, arbitrados por equidade, com observância dos parâmetros mínimos da Tabela de Honorários da OAB/MT e da jurisprudência do Superior Tribunal de Justiça sobre o tema, vedado o enriquecimento sem causa de qualquer das partes.`);
  P(`**${n}.2. Renúncia do mandato.** A CONTRATADA poderá renunciar a qualquer tempo, mediante notificação à CONTRATANTE para constituir novo patrono, permanecendo responsável pelo processo nos 10 (dez) dias subsequentes. Havendo renúncia por motivo justo imputável à CONTRATANTE, aplica-se a regra da Cláusula ${n}.1.`);
  P(`**${n}.3. Desistência.** Se a CONTRATANTE desistir da ação por exclusiva conveniência, sem anuência da CONTRATADA, arcará com honorários proporcionais ao trabalho realizado (Cláusula ${n}.1) e com o ressarcimento das despesas eventualmente adiantadas pela CONTRATADA.`);
  P(`**${n}.4. Acordo sem anuência.** A celebração de acordo pela CONTRATANTE sem prévia ciência da CONTRATADA não afasta a incidência dos honorários contratuais, que incidirão sobre o valor do acordo.`);
  n += 1;

  P(`## CLÁUSULA ${ORDINAL[n]} — DAS OBRIGAÇÕES DAS PARTES`);
  P(`**${n}.1. Da CONTRATADA:** a) prestar os serviços com zelo, diligência e técnica, empregando os meios jurídicos adequados; b) manter a CONTRATANTE informada sobre andamentos relevantes; c) observar o sigilo profissional.`);
  const fato = d.fatoEssencialDeclarado ? `, e declarando, desde já, ter informado à CONTRATADA, com fidelidade, ${d.fatoEssencialDeclarado}` : "";
  P(`**${n}.2. Da CONTRATANTE:** a) fornecer todos os documentos e informações necessários, respondendo pela veracidade e exatidão deles${fato}; b) fornecer e manter atualizados, perante a CONTRATADA, seus dados de contato pessoais — telefone, WhatsApp e endereço eletrônico —, reputando-se válidas as comunicações enviadas ao último contato informado; c) agir com lealdade, cooperação e boa-fé; d) abster-se de transigir, firmar acordos ou outorgar procuração a outro advogado para o mesmo fim sem prévio e expresso consentimento da CONTRATADA.`);
  const canal = [d.timbre.telefone, d.timbre.email].filter(Boolean).join(" ou ") || "[[VERIFICAR: telefone/e-mail oficiais do escritório]]";
  P(`**${n}.3. Canal de comunicação e prevenção a fraude.** As partes ajustam que, por segurança da CONTRATANTE, os dados de contato indicados na qualificação deste instrumento e nas peças processuais são os da CONTRATADA, medida destinada a evitar a captura de dados pessoais nos autos públicos por terceiros. A CONTRATANTE declara-se ciente de que **a CONTRATADA jamais solicitará depósito, transferência ou pagamento de taxa para liberação de alvará, RPV, precatório ou valores de acordo**, e que qualquer contato nesse sentido deve ser desconsiderado e imediatamente comunicado à CONTRATADA pelo canal oficial (${canal}).`);
  n += 1;

  P(`## CLÁUSULA ${ORDINAL[n]} — DAS DESPESAS`);
  P(`**${n}.1.** As despesas processuais e extraprocessuais (custas, taxas judiciárias, honorários periciais, cópias, deslocamentos e demais) não integram os honorários e são de responsabilidade exclusiva da CONTRATANTE.`);
  let sub = 2;
  if (d.gratuidade) {
    P(`**${n}.${sub}.** A CONTRATADA buscará, na peça inaugural, a concessão da gratuidade da justiça e, subsidiariamente, o parcelamento ou o diferimento do recolhimento das custas ao final do processo (art. 98, §§5º e 6º, do CPC). A CONTRATANTE declara estar ciente de que a gratuidade poderá ser indeferida ou parcialmente deferida, hipótese em que o custeio das despesas não isentas correrá por sua conta. Declara ainda estar ciente de que **a gratuidade da justiça não alcança os honorários contratuais ora pactuados**, que permanecem devidos na forma da Cláusula Segunda. Eventuais adiantamentos feitos pela CONTRATADA serão reembolsados em 5 (cinco) dias úteis.`);
    sub += 1;
  }
  P(`**${n}.${sub}.** Viagens e diligências fora da Comarca de ${ouLacuna(d.comarcaSede, "comarca da sede do escritório")} ensejam diária profissional e ressarcimento de transporte, alimentação e estadia, antecipados pela CONTRATANTE, na forma da Tabela IV da OAB/MT.`);
  n += 1;

  P(`## CLÁUSULA ${ORDINAL[n]} — DA PROTEÇÃO DE DADOS (LGPD)`);
  P(`**${n}.1.** A CONTRATANTE autoriza a CONTRATADA a tratar seus dados pessoais, inclusive sensíveis, estritamente para a execução do mandato e o cumprimento de obrigações legais e regulatórias, nos termos da Lei nº 13.709/2018.`);
  P(`**${n}.2.** A CONTRATADA adotará medidas técnicas e administrativas para proteger os dados contra acessos não autorizados e situações acidentais ou ilícitas, garantindo confidencialidade, integridade e disponibilidade.`);
  n += 1;

  P(`## CLÁUSULA ${ORDINAL[n]} — DAS DISPOSIÇÕES GERAIS`);
  P(`**${n}.1.** O contrato é celebrado em caráter de exclusividade, obrigando as partes, seus herdeiros e sucessores.`);
  P(`**${n}.2.** Qualquer alteração somente será válida mediante termo aditivo escrito.`);
  P(`**${n}.3.** A tolerância quanto ao descumprimento de qualquer obrigação não implica novação nem renúncia.`);
  n += 1;

  P(`## CLÁUSULA ${ORDINAL[n]} — DO FORO`);
  P(`**${n}.1.** Para dirimir controvérsias oriundas deste contrato, as partes elegem o foro da Comarca de **${ouLacuna(d.comarcaForo, "comarca do domicílio do cliente")}**, com renúncia a qualquer outro.`);
  P("E, por estarem justas e contratadas, as partes assinam o presente em 2 (duas) vias de igual teor.");
  P(`${ouLacuna(d.comarcaSede ?? d.timbre.cidade, "cidade")}/${d.timbre.uf ?? "MT"}, ${d.dataAssinatura ?? "data da assinatura eletrônica"}.`);
  P(`**${(d.timbre.razaoSocial || d.timbre.nome).toUpperCase()}**\nContratada`);
  P(`**${d.cliente.nome.toUpperCase()}**\nContratante`);
  return linhas.join("\n").trim() + "\n";
}

const ORDINAL: Record<number, string> = { 1: "PRIMEIRA", 2: "SEGUNDA", 3: "TERCEIRA", 4: "QUARTA", 5: "QUINTA", 6: "SEXTA", 7: "SÉTIMA", 8: "OITAVA", 9: "NONA", 10: "DÉCIMA", 11: "DÉCIMA PRIMEIRA" };

function numeroPorExtensoSimples(n: number): string {
  const nomes = ["", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze"];
  return nomes[n] ?? String(n);
}

export function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}
