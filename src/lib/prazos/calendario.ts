import { adicionarDias, anoDe, diaDaSemana, ehFimDeSemana, validarDataISO } from "./datas";
import type { Calendario, DataISO, DiaSemExpediente } from "./tipos";

export interface OpcoesCalendario {
  tribunal: string;
  /** Comarca do processo. Sem ela, feriados municipais são ignorados e o motor avisa. */
  comarcaId?: string | null;
  /** Anos cujo calendário forense foi carregado e conferido. Se omitido, deduz dos dias informados. */
  anosCobertos?: number[];
  /** Gera automaticamente o recesso de 20/12 a 20/01 (CPC art. 220) para os anos cobertos e vizinhos. Padrão: true. */
  incluirRecesso?: boolean;
}

/** Dias do recesso forense (CPC art. 220): 20/12 a 20/01, inclusive. */
export function diasDeRecesso(anoDezembro: number): DiaSemExpediente[] {
  const dias: DiaSemExpediente[] = [];
  let data: DataISO = `${anoDezembro}-12-20`;
  const fim: DataISO = `${anoDezembro + 1}-01-20`;
  while (data <= fim) {
    dias.push({ data, descricao: "Recesso forense (CPC art. 220)", abrangencia: "recesso", suspendePrazo: true, atoNormativo: "CPC art. 220" });
    data = adicionarDias(data, 1);
  }
  return dias;
}

/**
 * Monta o calendário aplicável a um processo a partir das linhas de `ref.feriados` de um tribunal.
 * Feriados municipais entram só quando `comarcaId` coincide.
 */
export function montarCalendario(dias: DiaSemExpediente[], opcoes: OpcoesCalendario): Calendario {
  const comarcaId = opcoes.comarcaId ?? null;
  const diasPorData = new Map<DataISO, DiaSemExpediente[]>();
  const anos = new Set<number>(opcoes.anosCobertos ?? []);

  const adicionar = (d: DiaSemExpediente) => {
    validarDataISO(d.data);
    const lista = diasPorData.get(d.data) ?? [];
    lista.push(d);
    diasPorData.set(d.data, lista);
  };

  for (const d of dias) {
    if (d.abrangencia === "municipal") {
      if (!comarcaId || !d.comarcaId || d.comarcaId !== comarcaId) continue;
    }
    adicionar(d);
    if (!opcoes.anosCobertos) anos.add(anoDe(d.data));
  }

  if (opcoes.incluirRecesso !== false) {
    const anosRecesso = new Set<number>();
    for (const a of anos) {
      anosRecesso.add(a - 1);
      anosRecesso.add(a);
    }
    for (const a of anosRecesso) {
      for (const d of diasDeRecesso(a)) {
        // Não duplica se a tabela já trouxe o recesso explicitamente.
        const existentes = diasPorData.get(d.data) ?? [];
        if (!existentes.some((e) => e.abrangencia === "recesso")) adicionar(d);
      }
    }
  }

  return { tribunal: opcoes.tribunal, comarcaId, anosCobertos: [...anos].sort(), diasPorData };
}

export interface MotivoNaoUtil {
  util: boolean;
  motivo: string | null;
  suspendePrazo: boolean;
}

/**
 * Classifica um dia. `considerarRecesso=false` serve a prazos materiais, que correm no recesso.
 * Um dia sem expediente que NÃO suspende prazo (expediente reduzido) é tratado como útil para contagem,
 * mas o chamador pode usá-lo para protrair começo e vencimento (CPC art. 224 §1º).
 */
export function classificarDia(data: DataISO, calendario: Calendario, considerarRecesso = true): MotivoNaoUtil {
  if (ehFimDeSemana(data)) {
    return { util: false, motivo: diaDaSemana(data) === 0 ? "domingo" : "sábado", suspendePrazo: true };
  }
  const dias = calendario.diasPorData.get(data) ?? [];
  const relevantes = dias.filter((d) => considerarRecesso || d.abrangencia !== "recesso");
  const suspensores = relevantes.filter((d) => d.suspendePrazo);
  if (suspensores.length > 0) {
    return { util: false, motivo: suspensores.map((d) => d.descricao).join("; "), suspendePrazo: true };
  }
  if (relevantes.length > 0) {
    return { util: true, motivo: relevantes.map((d) => d.descricao).join("; "), suspendePrazo: false };
  }
  return { util: true, motivo: null, suspendePrazo: false };
}

export function ehDiaUtil(data: DataISO, calendario: Calendario, considerarRecesso = true): boolean {
  return classificarDia(data, calendario, considerarRecesso).util;
}

/** Primeiro dia útil estritamente depois de `data`. */
export function proximoDiaUtil(data: DataISO, calendario: Calendario, considerarRecesso = true): DataISO {
  let d = adicionarDias(data, 1);
  let guarda = 0;
  while (!ehDiaUtil(d, calendario, considerarRecesso)) {
    d = adicionarDias(d, 1);
    if (++guarda > 400) throw new Error("Calendário sem dia útil em mais de 400 dias; verifique os dados");
  }
  return d;
}

/** `data` se for útil; senão, o próximo dia útil. */
export function diaUtilOuProximo(data: DataISO, calendario: Calendario, considerarRecesso = true): DataISO {
  return ehDiaUtil(data, calendario, considerarRecesso) ? data : proximoDiaUtil(data, calendario, considerarRecesso);
}

/** Subtrai N dias úteis de `data` (para a data interna de segurança). */
export function subtrairDiasUteis(data: DataISO, dias: number, calendario: Calendario): DataISO {
  let d = data;
  let restantes = dias;
  let guarda = 0;
  while (restantes > 0) {
    d = adicionarDias(d, -1);
    if (ehDiaUtil(d, calendario)) restantes -= 1;
    if (++guarda > 400) throw new Error("Calendário sem dia útil em mais de 400 dias; verifique os dados");
  }
  return d;
}

/** Anos percorridos entre duas datas (inclusive). */
export function anosEntre(inicio: DataISO, fim: DataISO): number[] {
  const anos: number[] = [];
  for (let a = anoDe(inicio); a <= anoDe(fim); a++) anos.push(a);
  return anos;
}
