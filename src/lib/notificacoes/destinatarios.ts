import type { Ausencia, Membro } from "./tipos";

export interface DestinatarioResolvido {
  usuarioId: string;
  /** "direto" quando é o próprio; os demais indicam redirecionamento. */
  motivo: "direto" | "ausencia" | "ausencia_sem_substituto" | "inativo";
  /** Id do destinatário original quando houve redirecionamento. */
  substituiA?: string;
}

/** Data local (YYYY-MM-DD) a partir de uma string ISO de data ou data-hora. */
function diaDe(agoraLocalISO: string): string {
  return agoraLocalISO.slice(0, 10);
}

export function estaAusente(usuarioId: string, dia: string, ausencias: readonly Ausencia[]): Ausencia | undefined {
  return ausencias.find((a) => a.usuarioId === usuarioId && a.inicio <= dia && dia <= a.fim);
}

/** Sócios ativos e não ausentes no dia, excluindo os ids indicados. */
export function sociosDisponiveis(
  dia: string,
  ausencias: readonly Ausencia[],
  membros: readonly Membro[],
  excluir: readonly string[] = [],
): Membro[] {
  return membros.filter(
    (m) => m.papel === "socio" && m.ativo && !excluir.includes(m.id) && !estaAusente(m.id, dia, ausencias),
  );
}

/**
 * Resolve quem efetivamente recebe uma notificação dirigida a `usuarioId`.
 *
 * - Usuário ativo e presente → ele mesmo.
 * - Ausente com substituto ativo e presente → o substituto (motivo "ausencia").
 * - Ausente sem substituto, ou substituto também ausente/inativo → sócios ativos
 *   e presentes (nunca segue a cadeia de substitutos, para não entrar em laço).
 * - Inativo → sócios ativos e presentes.
 * - Quando nem sócios há, devolve o próprio usuário para a notificação não se perder.
 *
 * @param agoraLocalISO data local YYYY-MM-DD (aceita ISO completo; usa os 10 primeiros caracteres).
 */
export function resolverDestinatario(
  usuarioId: string,
  agoraLocalISO: string,
  ausencias: readonly Ausencia[],
  membros: readonly Membro[],
): DestinatarioResolvido[] {
  const dia = diaDe(agoraLocalISO);
  const membro = membros.find((m) => m.id === usuarioId);

  const paraSocios = (motivo: DestinatarioResolvido["motivo"], excluir: string[]): DestinatarioResolvido[] => {
    const socios = sociosDisponiveis(dia, ausencias, membros, excluir);
    if (socios.length === 0) return [{ usuarioId, motivo: "direto" }];
    return socios.map((s) => ({ usuarioId: s.id, motivo, substituiA: usuarioId }));
  };

  if (membro && !membro.ativo) return paraSocios("inativo", [usuarioId]);

  const ausencia = estaAusente(usuarioId, dia, ausencias);
  if (!ausencia) return [{ usuarioId, motivo: "direto" }];

  const substituto = ausencia.substitutoId ? membros.find((m) => m.id === ausencia.substitutoId) : undefined;
  if (
    substituto &&
    substituto.id !== usuarioId &&
    substituto.ativo &&
    !estaAusente(substituto.id, dia, ausencias)
  ) {
    return [{ usuarioId: substituto.id, motivo: "ausencia", substituiA: usuarioId }];
  }

  return paraSocios("ausencia_sem_substituto", [usuarioId, ...(substituto ? [substituto.id] : [])]);
}
