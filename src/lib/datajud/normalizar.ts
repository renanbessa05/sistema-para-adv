import { comarcaPorIbge } from "./comarca-por-ibge";
import type { MovimentoDatajud, MovimentoNormalizado, ProcessoDatajud, ProcessoDatajudSource } from "./tipos";

/**
 * Converte o `_source` do DataJud em `ProcessoDatajud`.
 * Datas: aceita ISO 8601 e o formato compacto "AAAAMMDDhhmmss" (a confirmar na API real
 * qual dos dois o DataJud usa em cada campo; as respostas vistas trazem ISO).
 */

/** Interpreta uma data do DataJud e devolve ISO 8601 (UTC) ou null. */
export function paraIso(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const v = valor.trim();
  if (v === "") return null;
  const compacto = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/.exec(v);
  if (compacto) {
    const [, a, m, d, h = "00", mi = "00", s = "00"] = compacto;
    const data = new Date(Date.UTC(Number(a), Number(m) - 1, Number(d), Number(h), Number(mi), Number(s)));
    return Number.isNaN(data.getTime()) ? null : data.toISOString();
  }
  const data = new Date(v);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

/** "YYYY-MM-DD" a partir de qualquer data aceita por `paraIso` (usa a data UTC). */
export function paraDataIso(valor: string | null | undefined): string | null {
  const iso = paraIso(valor);
  return iso ? iso.slice(0, 10) : null;
}

function texto(valor: string | null | undefined): string | null {
  if (valor === undefined || valor === null) return null;
  const t = String(valor).trim();
  return t === "" ? null : t;
}

function numero(valor: number | null | undefined): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

export function normalizarMovimento(m: MovimentoDatajud): MovimentoNormalizado {
  return {
    codigo: numero(m.codigo),
    nome: texto(m.nome),
    data_hora: paraIso(m.dataHora),
    complementos: (m.complementosTabelados ?? []).map((c) => ({
      codigo: numero(c.codigo),
      nome: texto(c.nome),
      valor: numero(c.valor),
      descricao: texto(c.descricao),
    })),
  };
}

/** Ordena por data decrescente; movimentos sem data vão para o fim. */
export function ordenarMovimentos(movimentos: MovimentoNormalizado[]): MovimentoNormalizado[] {
  return [...movimentos].sort((a, b) => {
    if (a.data_hora === b.data_hora) return 0;
    if (a.data_hora === null) return 1;
    if (b.data_hora === null) return -1;
    return a.data_hora < b.data_hora ? 1 : -1;
  });
}

export function normalizarProcessoDatajud(source: ProcessoDatajudSource): ProcessoDatajud {
  const movimentos = ordenarMovimentos((source.movimentos ?? []).map(normalizarMovimento));
  const nivelSigilo = numero(source.nivelSigilo) ?? 0;
  const codigoIbge = numero(source.orgaoJulgador?.codigoMunicipioIBGE);

  return {
    numero_cnj: source.numeroProcesso.replace(/\D/g, ""),
    tribunal: texto(source.tribunal)?.toUpperCase() ?? null,
    grau: texto(source.grau)?.toUpperCase() ?? null,
    classe_codigo: numero(source.classe?.codigo),
    classe_nome: texto(source.classe?.nome),
    assuntos: (source.assuntos ?? []).map((a) => ({ codigo: numero(a.codigo), nome: texto(a.nome) })),
    sistema: texto(source.sistema?.nome),
    formato: texto(source.formato?.nome),
    data_ajuizamento: paraDataIso(source.dataAjuizamento),
    ultima_atualizacao: paraIso(source.dataHoraUltimaAtualizacao),
    nivel_sigilo: nivelSigilo,
    sigiloso: nivelSigilo > 0,
    orgao_julgador_codigo: numero(source.orgaoJulgador?.codigo),
    orgao_julgador_nome: texto(source.orgaoJulgador?.nome),
    codigo_municipio_ibge: codigoIbge,
    comarca: comarcaPorIbge(codigoIbge),
    movimentos,
    ultimo_movimento: movimentos[0] ?? null,
    payload_bruto: source,
  };
}
