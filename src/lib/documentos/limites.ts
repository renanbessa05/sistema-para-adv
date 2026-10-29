/**
 * Limites de documentos (puro). A API do Claude aceita PDF de até 32 MB e 600 páginas (a confirmar na
 * documentação vigente); aqui a margem é menor para proteger o tempo das funções na Vercel.
 */

export const MIMES_ACEITOS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/markdown": "md",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export const TAMANHO_MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // igual ao file_size_limit do Storage (50MiB)

export interface LimitesApi {
  maxMb: number;
  maxPaginas: number;
}

export const LIMITES_API_PADRAO: LimitesApi = { maxMb: 20, maxPaginas: 300 };

/** O documento pode ir inteiro à API como bloco `document`? Caso contrário vai por páginas extraídas. */
export function cabeNaApi(tamanhoBytes: number, paginas: number | null, limites: LimitesApi = LIMITES_API_PADRAO): boolean {
  if (tamanhoBytes > limites.maxMb * 1024 * 1024) return false;
  if (paginas !== null && paginas > limites.maxPaginas) return false;
  return true;
}

export function extensaoDoMime(mime: string): string | null {
  return MIMES_ACEITOS[mime] ?? null;
}

export function mimeAceito(mime: string): boolean {
  return mime in MIMES_ACEITOS;
}

/** Nome de arquivo seguro para o Storage: sem caminho, sem caracteres de controle, tamanho limitado. */
export function nomeSeguro(nome: string, max = 120): string {
  const base = nome.split(/[\\/]/).pop() ?? "arquivo";
  const limpo = base.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim() || "arquivo";
  return limpo.length > max ? limpo.slice(0, max) : limpo;
}
