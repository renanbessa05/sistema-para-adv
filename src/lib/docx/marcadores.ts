import { listarLacunas } from "../ia/lacunas";

/**
 * Nenhum marcador pode sobreviver no documento final: `[[VERIFICAR: ...]]` (lacuna unificada) nem o `[[CAMPO]]`
 * dos modelos originais. Devolve a lista para a tela bloquear a aprovação e mostrar o que falta.
 */
export interface MarcadorPendente {
  texto: string;
  posicao: number;
}

export function verificarMarcadores(texto: string): MarcadorPendente[] {
  const pendentes: MarcadorPendente[] = listarLacunas(texto).map((l) => ({ texto: `[[VERIFICAR: ${l.motivo}]]`, posicao: l.posicao }));
  for (const m of texto.matchAll(/\[\[(?!\s*VERIFICAR)[^\]]{1,80}\]\]/g)) pendentes.push({ texto: m[0], posicao: m.index ?? 0 });
  for (const m of texto.matchAll(/\[_{3,}\]/g)) pendentes.push({ texto: m[0], posicao: m.index ?? 0 });
  return pendentes.sort((a, b) => a.posicao - b.posicao);
}

/** Valor ou marcador de lacuna com o nome do campo. */
export function ouLacuna(valor: string | number | null | undefined, campo: string): string {
  if (valor === null || valor === undefined) return `[[VERIFICAR: ${campo}]]`;
  const s = String(valor).trim();
  return s ? s : `[[VERIFICAR: ${campo}]]`;
}
