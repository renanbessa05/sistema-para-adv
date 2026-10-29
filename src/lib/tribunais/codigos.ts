/**
 * Identificação do tribunal pelo número CNJ (Resolução 65/2008): NNNNNNN-DD.AAAA.J.TR.OOOO.
 * Fonte: skill analise-processual-todos-tribunais, references/tribunais-codigos.md. J = 8 é a Justiça estadual;
 * TR de 01 a 27 segue a ordem alfabética dos estados e do DF; TR 11 é o TJ-MT (fora desta análise).
 */
export const TRIBUNAIS_ESTADUAIS: Record<string, { sigla: string; nome: string }> = {
  "01": { sigla: "TJAC", nome: "Acre" },
  "02": { sigla: "TJAL", nome: "Alagoas" },
  "03": { sigla: "TJAP", nome: "Amapá" },
  "04": { sigla: "TJAM", nome: "Amazonas" },
  "05": { sigla: "TJBA", nome: "Bahia" },
  "06": { sigla: "TJCE", nome: "Ceará" },
  "07": { sigla: "TJDFT", nome: "Distrito Federal" },
  "08": { sigla: "TJES", nome: "Espírito Santo" },
  "09": { sigla: "TJGO", nome: "Goiás" },
  "10": { sigla: "TJMA", nome: "Maranhão" },
  "11": { sigla: "TJMT", nome: "Mato Grosso" },
  "12": { sigla: "TJMS", nome: "Mato Grosso do Sul" },
  "13": { sigla: "TJMG", nome: "Minas Gerais" },
  "14": { sigla: "TJPA", nome: "Pará" },
  "15": { sigla: "TJPB", nome: "Paraíba" },
  "16": { sigla: "TJPR", nome: "Paraná" },
  "17": { sigla: "TJPE", nome: "Pernambuco" },
  "18": { sigla: "TJPI", nome: "Piauí" },
  "19": { sigla: "TJRJ", nome: "Rio de Janeiro" },
  "20": { sigla: "TJRN", nome: "Rio Grande do Norte" },
  "21": { sigla: "TJRS", nome: "Rio Grande do Sul" },
  "22": { sigla: "TJRO", nome: "Rondônia" },
  "23": { sigla: "TJRR", nome: "Roraima" },
  "24": { sigla: "TJSC", nome: "Santa Catarina" },
  "25": { sigla: "TJSE", nome: "Sergipe" },
  "26": { sigla: "TJSP", nome: "São Paulo" },
  "27": { sigla: "TJTO", nome: "Tocantins" },
};

export interface TribunalIdentificado {
  /** Quando false, o número não é de Justiça estadual: esta análise não se aplica. */
  aplicavel: boolean;
  motivo: string | null;
  sigla: string | null;
  nome: string | null;
  /** TJ-MT: a análise de outros tribunais não se aplica (há habilidades próprias). */
  mato_grosso: boolean;
}

const NAO_APLICAVEL = (motivo: string): TribunalIdentificado => ({ aplicavel: false, motivo, sigla: null, nome: null, mato_grosso: false });

export function identificarTribunal(numeroCnj: string): TribunalIdentificado {
  const digitos = numeroCnj.replace(/\D/g, "");
  if (digitos.length !== 20) return NAO_APLICAVEL("número CNJ com 20 dígitos não encontrado");
  const segmento = digitos[13];
  if (segmento !== "8") return NAO_APLICAVEL(`segmento J=${segmento}: não é Justiça estadual`);
  const tr = digitos.slice(14, 16);
  if (tr === "11") return { aplicavel: false, motivo: "TJ-MT: use as habilidades próprias de Mato Grosso", sigla: "TJMT", nome: "Mato Grosso", mato_grosso: true };
  const tribunal = TRIBUNAIS_ESTADUAIS[tr];
  if (!tribunal) return NAO_APLICAVEL(`TR ${tr} não corresponde a nenhum TJ estadual`);
  return { aplicavel: true, motivo: null, sigla: tribunal.sigla, nome: tribunal.nome, mato_grosso: false };
}
