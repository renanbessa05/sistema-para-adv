import { extractText, getDocumentProxy } from "unpdf";

/**
 * Extração de texto de PDF (puro, sem banco). Usa o pdf.js empacotado pelo `unpdf`, que roda em serverless sem
 * worker nativo. PDF escaneado (imagem) devolve páginas vazias: o chamador marca `precisa_ocr` e, mesmo assim,
 * o documento pode ir inteiro à API como bloco `document` (o modelo lê a imagem).
 */

export interface PaginaExtraida {
  numero: number;
  texto: string;
}

export interface ResultadoExtracao {
  totalPaginas: number;
  paginas: PaginaExtraida[];
  /** Nenhuma página tem texto: provavelmente digitalizado sem OCR. */
  semTexto: boolean;
}

export async function extrairPaginas(dados: Uint8Array | ArrayBuffer): Promise<ResultadoExtracao> {
  const bytes = dados instanceof ArrayBuffer ? new Uint8Array(dados) : dados;
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const paginas = text.map((t, i) => ({ numero: i + 1, texto: limparTexto(t) }));
  const semTexto = paginas.every((p) => p.texto.length === 0);
  return { totalPaginas: totalPages, paginas, semTexto };
}

/** Normaliza o texto de uma página: quebras múltiplas, espaços e hifenização de fim de linha. */
export function limparTexto(texto: string): string {
  return texto
    .replace(/\u0000/g, "")
    .replace(/-\n(?=[a-záéíóúâêôãõç])/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export interface ItemInventario {
  pagina: number;
  titulo: string;
}

/**
 * Inventário heurístico de autos: páginas que começam peças ou documentos relevantes (cabeçalhos em caixa alta,
 * "ID", "fls.", "DECISÃO", "SENTENÇA", "CERTIDÃO"...). Serve para a IA navegar autos grandes com `ler_documento`.
 */
export function inventariar(paginas: PaginaExtraida[]): ItemInventario[] {
  const itens: ItemInventario[] = [];
  const padroes = [
    /^(EXCELENT[IÍ]SSIMO|EXMO|EGR[EÉ]GIO|COLENDA)/i,
    /^(SENTEN[ÇC]A|DECIS[ÃA]O|DESPACHO|CERTID[ÃA]O|ATA DE AUDI[EÊ]NCIA|MANDADO|INTIMA[ÇC][ÃA]O|CITA[ÇC][ÃA]O|LAUDO|PARECER|AC[ÓO]RD[ÃA]O|RELAT[ÓO]RIO|CONTESTA[ÇC][ÃA]O|R[ÉE]PLICA|PETI[ÇC][ÃA]O|RECURSO|AGRAVO|APELA[ÇC][ÃA]O|EMBARGOS|PROCURA[ÇC][ÃA]O|CONTRATO|COMPROVANTE)\b/i,
    /^(Num\.|ID\s*\d{6,}|fls?\.\s*\d+)/i,
  ];
  for (const p of paginas) {
    const primeiraLinha = p.texto.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
    if (!primeiraLinha) continue;
    if (padroes.some((re) => re.test(primeiraLinha))) {
      itens.push({ pagina: p.numero, titulo: primeiraLinha.slice(0, 120) });
    }
  }
  return itens;
}

/** Monta o texto de um intervalo de páginas para a IA, com marcadores de página. */
export function montarTrecho(paginas: PaginaExtraida[], de: number, ate: number, maxCaracteres = 60_000): string {
  const partes: string[] = [];
  let total = 0;
  for (const p of paginas) {
    if (p.numero < de || p.numero > ate) continue;
    const bloco = `--- página ${p.numero} ---\n${p.texto}`;
    if (total + bloco.length > maxCaracteres) {
      partes.push(`[trecho truncado em ${maxCaracteres} caracteres; peça as páginas seguintes separadamente]`);
      break;
    }
    partes.push(bloco);
    total += bloco.length;
  }
  return partes.join("\n\n");
}
