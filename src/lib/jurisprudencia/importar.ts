import { z } from "zod";

/**
 * Importação manual da jurisprudência (CSV com ponto e vírgula, ou JSON). Sem rede: só valida e normaliza.
 * Cabeçalho do CSV: tribunal;tipo;referencia;orgao;data;ementa. A ementa é a última coluna e pode ter ';'.
 */
export const TIPOS_JURISPRUDENCIA = ["sumula", "sumula_vinculante", "tema_repetitivo", "acordao", "decisao_monocratica", "outro"] as const;

const RegistroSchema = z.object({
  tribunal: z.string().trim().min(2),
  tipo: z.enum(TIPOS_JURISPRUDENCIA),
  referencia: z.string().trim().min(3),
  orgao: z.string().trim().nullable().optional(),
  data: z.string().trim().nullable().optional(),
  ementa: z.string().trim().min(20, "ementa com menos de 20 caracteres"),
});

export interface RegistroImportado {
  tribunal: string;
  tipo: (typeof TIPOS_JURISPRUDENCIA)[number];
  referencia: string;
  orgao: string | null;
  data: string | null;
  ementa: string;
}

export class ErroImportacao extends Error {}

/** Aceita AAAA-MM-DD ou DD/MM/AAAA e devolve AAAA-MM-DD (ou null). */
export function normalizarData(bruta: string | null | undefined): string | null {
  if (!bruta) return null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(bruta);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(bruta)) return bruta;
  throw new ErroImportacao(`Data inválida: ${bruta} (use AAAA-MM-DD ou DD/MM/AAAA)`);
}

function linhasDoCsv(conteudo: string): Record<string, string>[] {
  const linhas = conteudo.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) throw new ErroImportacao("CSV sem linhas de dados (o cabeçalho sozinho não serve).");
  return linhas.slice(1).map((linha, i) => {
    const partes = linha.split(";");
    if (partes.length < 6) throw new ErroImportacao(`Linha ${i + 2}: faltam colunas (esperado tribunal;tipo;referencia;orgao;data;ementa)`);
    const [tribunal, tipo, referencia, orgao, data, ...ementa] = partes;
    return { tribunal, tipo, referencia, orgao, data, ementa: ementa.join(";") };
  });
}

export function parsearImportacao(formato: "csv" | "json", conteudo: string): RegistroImportado[] {
  let brutos: unknown[];
  if (formato === "json") {
    try {
      const j = JSON.parse(conteudo) as unknown;
      if (!Array.isArray(j)) throw new ErroImportacao("O JSON precisa ser uma lista de registros.");
      brutos = j;
    } catch (e) {
      if (e instanceof ErroImportacao) throw e;
      throw new ErroImportacao("JSON inválido.");
    }
  } else {
    brutos = linhasDoCsv(conteudo);
  }
  return brutos.map((bruto, i) => {
    const r = RegistroSchema.safeParse(bruto);
    if (!r.success) throw new ErroImportacao(`Registro ${i + 1}: ${r.error.issues[0]?.message ?? "inválido"}`);
    return {
      tribunal: r.data.tribunal,
      tipo: r.data.tipo,
      referencia: r.data.referencia,
      orgao: r.data.orgao || null,
      data: normalizarData(r.data.data),
      ementa: r.data.ementa,
    };
  });
}
