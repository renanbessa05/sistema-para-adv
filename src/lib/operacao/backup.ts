/**
 * Backup por tenant: regras puras (montagem, caminho, validação do pacote e do tamanho).
 * Não importa Next nem Supabase; o job em src/server/jobs/backup.ts faz a leitura e a gravação.
 */

/** Tabelas de negócio com escritorio_id copiadas no snapshot. Credenciais (integracoes, Vault) ficam de fora. */
export const TABELAS_BACKUP = [
  "clientes",
  "processos",
  "processo_partes",
  "movimentacoes",
  "publicacoes",
  "prazos",
  "tarefas",
  "tarefa_eventos",
  "aprovacoes",
  "contratos",
  "contrato_parcelas",
  "minutas",
  "calculos",
  "conversas",
  "mensagens",
] as const;

export const VERSAO_PACOTE_BACKUP = 1;

/** Tamanho mínimo de um pacote válido: abaixo disso, algo falhou (pacote só com cabeçalho). */
export const TAMANHO_MINIMO_BACKUP_BYTES = 200;

/** Caminho no bucket `exportacoes`: backups/<escritorio>/<instante>.json (sem sobrescrever). */
export function caminhoBackup(escritorioId: string, geradoEm: Date): string {
  const instante = geradoEm.toISOString().replace(/[:.]/g, "-");
  return `backups/${escritorioId}/${instante}.json`;
}

export interface PacoteBackup {
  versao: number;
  escritorio_id: string;
  gerado_em: string;
  tabelas: Record<string, Record<string, unknown>[]>;
}

/** Monta o JSON do snapshot e devolve as contagens por tabela. */
export function montarPacoteBackup(entrada: { escritorioId: string; geradoEm: Date; tabelas: Record<string, Record<string, unknown>[]> }): { conteudo: string; contagens: Record<string, number>; totalLinhas: number } {
  const pacote: PacoteBackup = {
    versao: VERSAO_PACOTE_BACKUP,
    escritorio_id: entrada.escritorioId,
    gerado_em: entrada.geradoEm.toISOString(),
    tabelas: entrada.tabelas,
  };
  const contagens: Record<string, number> = {};
  let totalLinhas = 0;
  for (const [tabela, linhas] of Object.entries(entrada.tabelas)) {
    contagens[tabela] = linhas.length;
    totalLinhas += linhas.length;
  }
  return { conteudo: JSON.stringify(pacote), contagens, totalLinhas };
}

export type ResultadoValidacaoPacote = { ok: true; pacote: PacoteBackup } | { ok: false; motivo: string };

/** Confere a estrutura do pacote antes de restaurar ou de dar o backup por bom. */
export function validarPacoteBackup(texto: string, escritorioEsperado?: string): ResultadoValidacaoPacote {
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    return { ok: false, motivo: "arquivo não é JSON válido" };
  }
  if (!dados || typeof dados !== "object") return { ok: false, motivo: "pacote vazio ou fora do formato" };
  const p = dados as Partial<PacoteBackup>;
  if (p.versao !== VERSAO_PACOTE_BACKUP) return { ok: false, motivo: `versão de pacote não suportada: ${String(p.versao)}` };
  if (typeof p.escritorio_id !== "string") return { ok: false, motivo: "pacote sem escritorio_id" };
  if (escritorioEsperado && p.escritorio_id !== escritorioEsperado) return { ok: false, motivo: "pacote pertence a outro escritório" };
  if (!p.tabelas || typeof p.tabelas !== "object") return { ok: false, motivo: "pacote sem tabelas" };
  for (const [tabela, linhas] of Object.entries(p.tabelas)) {
    if (!Array.isArray(linhas)) return { ok: false, motivo: `tabela ${tabela} não é lista` };
    for (const linha of linhas) {
      if (!linha || typeof linha !== "object" || Array.isArray(linha)) return { ok: false, motivo: `linha inválida em ${tabela}` };
      const escritorioLinha = (linha as Record<string, unknown>).escritorio_id;
      if (escritorioLinha !== undefined && escritorioLinha !== p.escritorio_id) return { ok: false, motivo: `linha de outro escritório em ${tabela}` };
    }
  }
  return { ok: true, pacote: p as PacoteBackup };
}

/**
 * Tamanho razoável: acima do mínimo e, se houver backup anterior ok, não menos da metade dele
 * (queda brusca costuma indicar tabela vazia ou leitura interrompida).
 */
export function avaliarTamanhoBackup(tamanhoBytes: number, tamanhoAnteriorBytes: number | null): { ok: boolean; motivo?: string } {
  if (tamanhoBytes < TAMANHO_MINIMO_BACKUP_BYTES) return { ok: false, motivo: `tamanho ${tamanhoBytes} bytes abaixo do mínimo` };
  if (tamanhoAnteriorBytes !== null && tamanhoAnteriorBytes > 0 && tamanhoBytes < tamanhoAnteriorBytes / 2) {
    return { ok: false, motivo: `tamanho caiu para menos da metade do backup anterior (${tamanhoBytes} < ${tamanhoAnteriorBytes / 2})` };
  }
  return { ok: true };
}
