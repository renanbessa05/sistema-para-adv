import { comarcaPorIbge } from "./comarca-por-ibge";
import type { CompetenciaDeduzida, MovimentoDatajud, MovimentoNormalizado, ProcessoDatajud, ProcessoDatajudSource } from "./tipos";

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

/** Minúsculas, sem acento e sem espaços nas pontas, para comparar nomes de órgão e classe. */
function semAcento(valor: string | null | undefined): string {
  return (valor ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Deduz `processos.competencia` a partir do DataJud (decisão 1.4.10 do escopo): para Juizado Especial o motor
 * não valida a contagem automaticamente. Regras, nesta ordem:
 * - 'juizado_especial' quando o órgão julgador ou a classe contém "juizado", ou a classe contém "recurso inominado"
 *   (turma recursal julga recurso de juizado; a contagem segue a Lei 9.099/95);
 * - 'segundo_grau' quando o grau indica 2º grau ("G2", "2", "segundo") ou o órgão é turma ou câmara;
 * - senão 'vara_comum'.
 * Nunca devolve 'outra': essa é escolha manual da equipe.
 */
export function deduzirCompetencia(dados: { grau?: string | null; orgaoJulgadorNome?: string | null; classeNome?: string | null }): CompetenciaDeduzida {
  const orgao = semAcento(dados.orgaoJulgadorNome);
  const classe = semAcento(dados.classeNome);
  const grau = semAcento(dados.grau);
  if (orgao.includes("juizado") || classe.includes("juizado") || classe.includes("recurso inominado")) return "juizado_especial";
  if (grau === "g2" || grau === "2" || grau.includes("segundo") || /\bturma\b/.test(orgao) || /\bcamara\b/.test(orgao)) return "segundo_grau";
  return "vara_comum";
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
  const grau = texto(source.grau)?.toUpperCase() ?? null;
  const classeNome = texto(source.classe?.nome);
  const orgaoJulgadorNome = texto(source.orgaoJulgador?.nome);

  return {
    numero_cnj: source.numeroProcesso.replace(/\D/g, ""),
    tribunal: texto(source.tribunal)?.toUpperCase() ?? null,
    grau,
    classe_codigo: numero(source.classe?.codigo),
    classe_nome: classeNome,
    assuntos: (source.assuntos ?? []).map((a) => ({ codigo: numero(a.codigo), nome: texto(a.nome) })),
    sistema: texto(source.sistema?.nome),
    formato: texto(source.formato?.nome),
    data_ajuizamento: paraDataIso(source.dataAjuizamento),
    ultima_atualizacao: paraIso(source.dataHoraUltimaAtualizacao),
    nivel_sigilo: nivelSigilo,
    sigiloso: nivelSigilo > 0,
    orgao_julgador_codigo: numero(source.orgaoJulgador?.codigo),
    orgao_julgador_nome: orgaoJulgadorNome,
    codigo_municipio_ibge: codigoIbge,
    comarca: comarcaPorIbge(codigoIbge),
    competencia: deduzirCompetencia({ grau, orgaoJulgadorNome, classeNome }),
    movimentos,
    ultimo_movimento: movimentos[0] ?? null,
    payload_bruto: source,
  };
}
