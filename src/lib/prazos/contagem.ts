import { anosEntre, classificarDia, diaUtilOuProximo, subtrairDiasUteis } from "./calendario";
import { adicionarDias, formatarBr, nomeDiaSemana } from "./datas";
import { calcularTermoInicial } from "./termo-inicial";
import type { DataISO, EntradaCalculo, LinhaMemoria, ResultadoCalculo } from "./tipos";

/**
 * Calcula a data final de um prazo e produz a memória de contagem linha a linha.
 *
 * Regras (TJ-MT, processo civil):
 * - dias úteis: só dias úteis contam (CPC art. 219); fins de semana, feriados, pontos facultativos,
 *   suspensões e o recesso (art. 220) são pulados.
 * - dias corridos processuais: todo dia conta, mas o recesso e as suspensões pausam a contagem;
 *   vencimento em dia não útil é protraído para o 1º dia útil seguinte (art. 224, §1º).
 * - dias corridos materiais (prescrição, decadência, obrigações): contagem civil pura, sem pausa e sem protração.
 * - horas: convertidas em dias civis (24 h = 1 dia), com aviso para conferir a hora-limite.
 * - multiplicador 2: prazo em dobro (arts. 180, 183, 186); nunca para litisconsortes em autos eletrônicos (art. 229, §2º).
 */
export function calcularPrazo(entrada: EntradaCalculo): ResultadoCalculo {
  const { ato, calendario } = entrada;
  if (!Number.isInteger(ato.quantidade) || ato.quantidade <= 0) throw new Error("Quantidade do prazo precisa ser inteiro positivo");
  const multiplicador = ato.multiplicador ?? 1;
  const tipo = ato.tipo ?? "processual";
  const material = tipo === "material";
  const considerarRecesso = !material;

  const avisos: string[] = [];
  const memoria: LinhaMemoria[] = [];
  const diasPulados: { data: DataISO; motivo: string }[] = [];

  const termo = calcularTermoInicial(entrada, calendario, considerarRecesso);
  avisos.push(...termo.avisos);

  if (termo.dataDisponibilizacao) memoria.push({ data: termo.dataDisponibilizacao, dia: null, status: "marco", motivo: "Disponibilização no DJEN" });
  if (termo.dataPublicacao) memoria.push({ data: termo.dataPublicacao, dia: null, status: "marco", motivo: termo.dataDisponibilizacao ? "Data de publicação (1º dia útil seguinte à disponibilização)" : "Data da publicação ou ciência" });

  let quantidade = ato.quantidade;
  let contagem = ato.contagem;
  if (contagem === "horas") {
    quantidade = Math.ceil(ato.quantidade / 24);
    contagem = "dias_corridos";
    avisos.push(`Prazo de ${ato.quantidade} horas convertido em ${quantidade} dia(s) civil(is); confira a hora-limite no ato`);
  }
  const quantidadeEfetiva = quantidade * multiplicador;
  if (multiplicador === 2) {
    avisos.push(`Prazo em dobro aplicado${ato.fundamentoDobro ? ` (${ato.fundamentoDobro})` : ""}; não se aplica a litisconsortes em autos eletrônicos (CPC art. 229, §2º)`);
  }
  if (material) avisos.push("Prazo material: contagem civil, sem suspensão no recesso e sem protração do vencimento");

  let data: DataISO = termo.dataInicioContagem;
  let contados = 0;
  let guarda = 0;

  while (contados < quantidadeEfetiva) {
    if (++guarda > 5000) throw new Error("Contagem excedeu 5000 dias; verifique os dados");
    const classe = classificarDia(data, calendario, considerarRecesso);
    // Quando o dia não conta, `motivoPulo` explica por quê (classificarDia sempre dá motivo a dia não útil).
    let motivoPulo = "";

    if (material) {
      // prazo material: todo dia civil conta
    } else if (contagem === "dias_uteis") {
      if (!classe.util) motivoPulo = classe.motivo!;
    } else {
      // dias corridos processuais: pausa só no recesso e nas suspensões declaradas; fim de semana e feriado contam.
      const dias = calendario.diasPorData.get(data) ?? [];
      const suspensao = dias.find((d) => d.suspendePrazo && (d.abrangencia === "recesso" || d.abrangencia === "suspensao_ad_hoc"));
      if (suspensao) motivoPulo = suspensao.descricao;
    }

    if (motivoPulo === "") {
      contados += 1;
      const detalhe = classe.motivo && classe.util ? ` (${classe.motivo})` : "";
      memoria.push({ data, dia: contados, status: "contado", motivo: `${nomeDiaSemana(data)}${detalhe}` });
    } else {
      memoria.push({ data, dia: null, status: "pulado", motivo: motivoPulo });
      diasPulados.push({ data, motivo: motivoPulo });
    }
    if (contados < quantidadeEfetiva) data = adicionarDias(data, 1);
  }

  let dataFinal: DataISO = data;
  if (!material) {
    const protraida = diaUtilOuProximo(dataFinal, calendario, considerarRecesso);
    if (protraida !== dataFinal) {
      memoria.push({ data: protraida, dia: null, status: "marco", motivo: `Vencimento protraído para o 1º dia útil seguinte (CPC art. 224, §1º): ${formatarBr(protraida)}` });
      dataFinal = protraida;
    }
  }

  // Calendário incompleto: algum ano percorrido sem calendário forense carregado, ou comarca ausente.
  const anos = anosEntre(termo.dataDisponibilizacao ?? termo.dataInicioContagem, dataFinal);
  const anosFaltantes = anos.filter((a) => !calendario.anosCobertos.includes(a));
  let calendarioIncompleto = false;
  if (anosFaltantes.length > 0) {
    calendarioIncompleto = true;
    avisos.push(`Calendário forense não carregado para ${anosFaltantes.join(", ")}: feriados desse período podem estar faltando`);
  }
  if (!calendario.comarcaId && !material) {
    calendarioIncompleto = true;
    avisos.push("Comarca do processo não informada: feriados municipais não foram aplicados");
  }

  const diasSeguranca = entrada.diasSeguranca ?? 2;
  const dataInterna = diasSeguranca > 0 ? subtrairDiasUteis(dataFinal, diasSeguranca, calendario) : dataFinal;

  memoria.push({ data: dataFinal, dia: null, status: "marco", motivo: `Data final: ${formatarBr(dataFinal)} (${nomeDiaSemana(dataFinal)}), até 23h59min59s no horário do juízo` });

  return {
    dataDisponibilizacao: termo.dataDisponibilizacao,
    dataPublicacao: termo.dataPublicacao,
    dataInicioContagem: termo.dataInicioContagem,
    dataFinal,
    dataInterna,
    quantidadeEfetiva,
    contagem,
    diasPulados,
    avisos: [...termo.fundamentos, ...avisos],
    calendarioIncompleto,
    memoria,
  };
}

/** Texto da memória para exibição e para o log de aprovação. */
export function memoriaComoTexto(resultado: ResultadoCalculo): string {
  const linhas = resultado.memoria.map((l) => {
    if (l.status === "contado") return `${formatarBr(l.data)}  dia ${String(l.dia).padStart(2, " ")}  ${l.motivo}`;
    if (l.status === "pulado") return `${formatarBr(l.data)}  —       pulado: ${l.motivo}`;
    return `${formatarBr(l.data)}  *       ${l.motivo}`;
  });
  return [...linhas, "", ...resultado.avisos.map((a) => `• ${a}`)].join("\n");
}
