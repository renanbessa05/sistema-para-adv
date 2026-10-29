/**
 * Dados do timbre dos documentos do escritório. Vêm de `escritorios` (nome, razão social, CNPJ) e de
 * `escritorio_configuracoes['documentos.timbre']` (endereço, contatos, advogada responsável). O timbre genérico
 * é gerado daqui; a advogada pode substituí-lo por um modelo .docx próprio (lote 4, Configurações → Modelos).
 */
export interface Timbre {
  nome: string;
  razaoSocial: string | null;
  cnpj: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  telefone: string | null;
  email: string | null;
  site: string | null;
  /** Advogada(o) responsável que assina pela sociedade. */
  advogadaNome: string | null;
  advogadaOab: string | null;
  advogadaNacionalidade: string | null;
  advogadaEstadoCivil: string | null;
  advogadaCpf: string | null;
  advogadaEmail: string | null;
}

export const TIMBRE_VAZIO: Timbre = {
  nome: "",
  razaoSocial: null,
  cnpj: null,
  endereco: null,
  bairro: null,
  cidade: null,
  uf: null,
  cep: null,
  telefone: null,
  email: null,
  site: null,
  advogadaNome: null,
  advogadaOab: null,
  advogadaNacionalidade: null,
  advogadaEstadoCivil: null,
  advogadaCpf: null,
  advogadaEmail: null,
};

export function formatarCnpj(cnpj: string | null): string | null {
  if (!cnpj) return null;
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formatarCpf(cpf: string | null): string | null {
  if (!cpf) return null;
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatarCep(cep: string | null): string | null {
  if (!cep) return null;
  const d = cep.replace(/\D/g, "");
  if (d.length !== 8) return cep;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}-${d.slice(5)}`;
}

/** Linha de endereço completa do escritório ("Rua X, nº 1, Bairro Y, Cidade/UF, CEP 00.000-000"). */
export function enderecoTimbre(t: Timbre): string | null {
  const partes = [t.endereco, t.bairro ? `Bairro ${t.bairro}` : null, t.cidade && t.uf ? `${t.cidade}/${t.uf}` : (t.cidade ?? t.uf), t.cep ? `CEP ${formatarCep(t.cep)}` : null].filter(Boolean);
  return partes.length ? partes.join(", ") : null;
}

/** Linhas do cabeçalho e do rodapé do timbre genérico. */
export function linhasTimbre(t: Timbre): { cabecalho: string[]; rodape: string[] } {
  const titulo = t.razaoSocial || t.nome;
  const cabecalho = [titulo.toUpperCase()];
  if (t.cnpj) cabecalho.push(`CNPJ ${formatarCnpj(t.cnpj)}`);
  const rodape: string[] = [];
  const end = enderecoTimbre(t);
  if (end) rodape.push(end);
  const contatos = [t.telefone, t.email, t.site].filter(Boolean).join(" · ");
  if (contatos) rodape.push(contatos);
  return { cabecalho, rodape };
}
