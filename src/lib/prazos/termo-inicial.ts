import { proximoDiaUtil } from "./calendario";
import { validarDataISO } from "./datas";
import type { Calendario, DataISO, OrigemIntimacao } from "./tipos";

export interface TermoInicial {
  dataDisponibilizacao: DataISO | null;
  dataPublicacao: DataISO | null;
  /** Dia 1 da contagem. */
  dataInicioContagem: DataISO;
  fundamentos: string[];
  avisos: string[];
}

/**
 * Termo inicial conforme a origem da comunicação.
 *
 * Publicação no DJEN (Lei 11.419/2006, art. 4º, §§3º e 4º; CPC art. 224, §§2º e 3º):
 *   publicação = 1º dia útil seguinte à disponibilização; contagem começa no 1º dia útil seguinte à publicação.
 * Intimação pessoal, citação eletrônica, audiência, decisão em audiência ou lançamento manual:
 *   o chamador informa `dataInicioContagem` (dia 1) ou `dataPublicacao` (dia da ciência), e o motor
 *   começa no dia útil seguinte (CPC art. 224 caput: exclui-se o dia do começo).
 */
export function calcularTermoInicial(
  entrada: { origem: OrigemIntimacao; dataDisponibilizacao?: DataISO; dataPublicacao?: DataISO; dataInicioContagem?: DataISO },
  calendario: Calendario,
  considerarRecesso = true,
): TermoInicial {
  const fundamentos: string[] = [];
  const avisos: string[] = [];

  if (entrada.dataInicioContagem) {
    validarDataISO(entrada.dataInicioContagem);
    fundamentos.push("Dia 1 informado diretamente (ciência pessoal, audiência ou lançamento manual)");
    return {
      dataDisponibilizacao: entrada.dataDisponibilizacao ?? null,
      dataPublicacao: entrada.dataPublicacao ?? null,
      dataInicioContagem: entrada.dataInicioContagem,
      fundamentos,
      avisos,
    };
  }

  let dataPublicacao: DataISO | null = entrada.dataPublicacao ?? null;
  const dataDisponibilizacao: DataISO | null = entrada.dataDisponibilizacao ?? null;

  if (dataPublicacao) {
    validarDataISO(dataPublicacao);
  } else if (dataDisponibilizacao) {
    validarDataISO(dataDisponibilizacao);
    dataPublicacao = proximoDiaUtil(dataDisponibilizacao, calendario, considerarRecesso);
    fundamentos.push("Publicação considerada no 1º dia útil seguinte à disponibilização (Lei 11.419/2006, art. 4º, §3º; CPC art. 224, §2º)");
  } else {
    throw new Error("Informe dataDisponibilizacao, dataPublicacao ou dataInicioContagem");
  }

  if (entrada.origem === "publicacao_djen") {
    fundamentos.push("Prazo inicia no 1º dia útil seguinte à publicação (Lei 11.419/2006, art. 4º, §4º; CPC art. 224, §3º; art. 231, VII)");
  } else {
    fundamentos.push("Exclui-se o dia do começo (CPC art. 224, caput); contagem inicia no dia útil seguinte");
    if (entrada.origem === "citacao_eletronica") {
      avisos.push("Citação eletrônica: o prazo corre do 5º dia útil seguinte à confirmação (CPC art. 231, IX); informe o dia 1 diretamente se for o caso");
    }
  }

  const dataInicioContagem = proximoDiaUtil(dataPublicacao, calendario, considerarRecesso);
  return { dataDisponibilizacao, dataPublicacao, dataInicioContagem, fundamentos, avisos };
}
