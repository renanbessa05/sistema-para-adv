import { proximoDiaUtil } from "./calendario";
import { adicionarDias, diaDaSemana, hojeNoFuso } from "./datas";
import type { Calendario, DataISO } from "./tipos";

export interface Periodos {
  hoje: DataISO;
  /** Próximo dia útil depois de hoje (na sexta, segunda). */
  amanha: DataISO;
  /** Dias úteis restantes da semana corrente, mais a próxima segunda quando configurado. */
  semanaInicio: DataISO;
  semanaFim: DataISO;
}

/** Implementa o glossário operacional (docs/regras/glossario.md). */
export function calcularPeriodos(calendario: Calendario, opcoes: { timeZone: string; incluirProximaSegunda?: boolean; agora?: Date; hoje?: DataISO }): Periodos {
  const hoje = opcoes.hoje ?? hojeNoFuso(opcoes.timeZone, opcoes.agora);
  const amanha = proximoDiaUtil(hoje, calendario);
  const ds = diaDaSemana(hoje); // 0 domingo .. 6 sábado
  const diasAteSexta = ds === 0 ? 5 : ds === 6 ? 6 : 5 - ds;
  let semanaFim = adicionarDias(hoje, Math.max(diasAteSexta, 0));
  if (opcoes.incluirProximaSegunda !== false) {
    // próxima segunda-feira após a sexta
    semanaFim = adicionarDias(semanaFim, 3);
  }
  return { hoje, amanha, semanaInicio: hoje, semanaFim };
}
