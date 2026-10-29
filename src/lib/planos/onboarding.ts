/**
 * Validação pura dos 3 passos do onboarding (docs/regras/planos.md, "Onboarding").
 * Passo 1: escritório. Passo 2: sócio responsável. Passo 3: revisão (sem dados novos).
 */

export interface DadosEscritorio {
  nome: string;
  razaoSocial?: string;
  cnpj?: string;
}

export interface DadosResponsavel {
  nomeCompleto: string;
  oabNumero?: string;
  oabUf?: string;
}

const UF_VALIDAS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

export function validarEscritorio(d: DadosEscritorio): string | null {
  if (d.nome.trim().length < 2) return "Informe o nome do escritório.";
  const cnpj = (d.cnpj ?? "").replace(/\D/g, "");
  if (cnpj !== "" && cnpj.length !== 14) return "CNPJ deve ter 14 dígitos (ou fique em branco).";
  return null;
}

export function validarResponsavel(d: DadosResponsavel): string | null {
  if (d.nomeCompleto.trim().length < 5) return "Informe seu nome completo.";
  const uf = (d.oabUf ?? "").trim().toUpperCase();
  if (uf !== "" && !UF_VALIDAS.has(uf)) return "UF da OAB inválida.";
  return null;
}
