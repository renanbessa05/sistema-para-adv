import { extrairDigitosCnj } from "./cnj-local";
import type { ItemDjen, PublicacaoNormalizada } from "./tipos";

/**
 * Converte um item bruto do DJEN em `PublicacaoNormalizada`.
 * Não consulta nada: só reorganiza campos, limpa HTML e padroniza datas.
 */

const ENTIDADES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  // Acentuação comum em português.
  aacute: "á", agrave: "à", acirc: "â", atilde: "ã", auml: "ä",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë",
  iacute: "í", igrave: "ì", icirc: "î", iuml: "ï",
  oacute: "ó", ograve: "ò", ocirc: "ô", otilde: "õ", ouml: "ö",
  uacute: "ú", ugrave: "ù", ucirc: "û", uuml: "ü",
  ccedil: "ç", ntilde: "ñ",
  Aacute: "Á", Agrave: "À", Acirc: "Â", Atilde: "Ã", Auml: "Ä",
  Eacute: "É", Egrave: "È", Ecirc: "Ê", Euml: "Ë",
  Iacute: "Í", Igrave: "Ì", Icirc: "Î", Iuml: "Ï",
  Oacute: "Ó", Ograve: "Ò", Ocirc: "Ô", Otilde: "Õ", Ouml: "Ö",
  Uacute: "Ú", Ugrave: "Ù", Ucirc: "Û", Uuml: "Ü",
  Ccedil: "Ç", Ntilde: "Ñ",
  ordf: "ª", ordm: "º", deg: "°", sect: "§", para: "¶",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", middot: "·", bull: "•",
};

/** Decodifica entidades HTML nomeadas (lista acima) e numéricas (&#NNN; / &#xHH;). */
export function decodificarEntidadesHtml(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (original, corpo: string) => {
    if (corpo[0] === "#") {
      const hex = corpo[1] === "x" || corpo[1] === "X";
      const codigo = Number.parseInt(corpo.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(codigo) || codigo <= 0 || codigo > 0x10ffff) return original;
      try {
        return String.fromCodePoint(codigo);
      } catch {
        return original;
      }
    }
    return corpo in ENTIDADES ? ENTIDADES[corpo] : original;
  });
}

/**
 * HTML → texto simples: remove script/style, transforma blocos em quebras de linha,
 * remove as demais tags, decodifica entidades e normaliza espaços
 * (linhas sem espaços duplicados, sem linhas vazias repetidas).
 */
export function htmlParaTexto(html: string | null | undefined): string {
  if (!html) return "";
  let t = html;
  t = t.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  t = t.replace(/<!--[\s\S]*?-->/g, " ");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/(p|div|li|tr|h[1-6]|blockquote|table|ul|ol|section|article|header|footer)>/gi, "\n");
  t = t.replace(/<(p|div|li|tr|h[1-6]|blockquote|table|ul|ol|section|article|header|footer)(\s[^>]*)?>/gi, "\n");
  t = t.replace(/<\/?t[dh](\s[^>]*)?>/gi, " ");
  t = t.replace(/<[^>]+>/g, " ");
  t = decodificarEntidadesHtml(t);
  t = t.replace(/ /g, " ");
  const linhas = t
    .split(/\r?\n/)
    .map((linha) => linha.replace(/[ \t\f\v]+/g, " ").trim())
    .filter((linha) => linha.length > 0);
  return linhas.join("\n");
}

/** Devolve "YYYY-MM-DD" a partir de "YYYY-MM-DD" ou "DD/MM/YYYY" (ou null). */
export function normalizarData(iso: string | null | undefined, brasileira: string | null | undefined): string | null {
  if (iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  if (brasileira) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(brasileira.trim());
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  // Último recurso: a data "iso" pode ter vindo no formato brasileiro, ou vice-versa.
  if (iso) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(iso.trim());
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  if (brasileira) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(brasileira.trim());
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return null;
}

function texto(valor: string | null | undefined): string | null {
  if (valor === undefined || valor === null) return null;
  const limpo = String(valor).trim();
  return limpo === "" ? null : limpo;
}

/**
 * Regra de cancelamento: `ativo === false`, `status === "C"` (a confirmar na API real),
 * ou presença de `motivo_cancelamento` / `data_cancelamento`.
 */
export function publicacaoCancelada(item: Pick<ItemDjen, "ativo" | "status" | "motivo_cancelamento" | "data_cancelamento">): boolean {
  if (item.ativo === false) return true;
  if (typeof item.status === "string" && item.status.trim().toUpperCase() === "C") return true;
  if (texto(item.motivo_cancelamento)) return true;
  if (texto(item.data_cancelamento)) return true;
  return false;
}

export function normalizarPublicacaoDjen(item: ItemDjen): PublicacaoNormalizada {
  const numeroTexto = texto(item.numeroprocessocommascara) ?? texto(item.numero_processo);
  const numeroCnj = extrairDigitosCnj(item.numeroprocessocommascara) ?? extrairDigitosCnj(item.numero_processo);

  const destinatarios = (item.destinatarios ?? []).map((d) => ({
    nome: texto(d.nome),
    polo: texto(d.polo),
  }));

  const destinatarioAdvogados = (item.destinatarioadvogados ?? []).map((da) => ({
    nome: texto(da.advogado?.nome),
    numero_oab: texto(da.advogado?.numero_oab),
    uf_oab: texto(da.advogado?.uf_oab)?.toUpperCase() ?? null,
  }));

  return {
    fonte: "djen",
    id_externo: String(item.id),
    hash_djen: item.hash,
    numero_cnj: numeroCnj,
    numero_processo_texto: numeroTexto,
    tribunal_sigla: texto(item.siglaTribunal)?.toUpperCase() ?? null,
    tipo_origem: texto(item.tipoComunicacao),
    tipo_documento: texto(item.tipoDocumento),
    orgao: texto(item.nomeOrgao),
    classe_nome: texto(item.nomeClasse),
    classe_codigo: texto(item.codigoClasse),
    meio: texto(item.meio)?.toUpperCase() ?? null,
    data_disponibilizacao: normalizarData(item.data_disponibilizacao, item.datadisponibilizacao),
    texto: htmlParaTexto(item.texto),
    texto_html: item.texto ?? null,
    link: texto(item.link),
    destinatarios,
    destinatario_advogados: destinatarioAdvogados,
    ativo: typeof item.ativo === "boolean" ? item.ativo : null,
    status: texto(item.status),
    cancelada: publicacaoCancelada(item),
    motivo_cancelamento: texto(item.motivo_cancelamento),
    data_cancelamento: texto(item.data_cancelamento),
    numero_comunicacao: typeof item.numeroComunicacao === "number" ? item.numeroComunicacao : null,
    payload_bruto: item,
  };
}
