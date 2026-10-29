import { AlignmentType, Document, Footer, Header, HeadingLevel, Packer, PageNumber, Paragraph, TextRun } from "docx";
import { linhasTimbre, type Timbre } from "./timbre";

/**
 * Markdown (subconjunto) → .docx com timbre. Cobre o que os modelos e as minutas usam: títulos (#, ##, ###),
 * parágrafos justificados, negrito (**x**) e itálico (*x*), listas (- e 1.), citações (>), linha em branco,
 * separador (---) e `[[pagebreak]]`. Sem HTML. O resultado abre no Word e no LibreOffice.
 */

const FONTE = "Arial";
const TAMANHO = 22; // 11 pt (metade de ponto)

export function trechosInline(linha: string): TextRun[] {
  const runs: TextRun[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;
  let ultimo = 0;
  for (const m of linha.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > ultimo) runs.push(new TextRun({ text: linha.slice(ultimo, i), font: FONTE, size: TAMANHO }));
    const t = m[0];
    if (t.startsWith("**")) runs.push(new TextRun({ text: t.slice(2, -2), bold: true, font: FONTE, size: TAMANHO }));
    else runs.push(new TextRun({ text: t.slice(1, -1), italics: true, font: FONTE, size: TAMANHO }));
    ultimo = i + t.length;
  }
  if (ultimo < linha.length) runs.push(new TextRun({ text: linha.slice(ultimo), font: FONTE, size: TAMANHO }));
  return runs.length ? runs : [new TextRun({ text: "", font: FONTE, size: TAMANHO })];
}

export function paragrafosDoMarkdown(md: string): Paragraph[] {
  const saida: Paragraph[] = [];
  const linhas = md.replace(/\r\n/g, "\n").split("\n");
  let buffer: string[] = [];
  const despejar = () => {
    if (buffer.length === 0) return;
    const texto = buffer.join(" ").trim();
    buffer = [];
    if (!texto) return;
    saida.push(new Paragraph({ children: trechosInline(texto), alignment: AlignmentType.JUSTIFIED, spacing: { after: 160, line: 320 } }));
  };
  for (const bruta of linhas) {
    const linha = bruta.trimEnd();
    if (linha.trim() === "") {
      despejar();
      continue;
    }
    if (linha.trim() === "[[pagebreak]]") {
      despejar();
      saida.push(new Paragraph({ children: [], pageBreakBefore: true }));
      continue;
    }
    if (/^---+$/.test(linha.trim())) {
      despejar();
      saida.push(new Paragraph({ children: [], border: { bottom: { style: "single", size: 6, color: "999999", space: 1 } }, spacing: { after: 160 } }));
      continue;
    }
    const titulo = linha.match(/^(#{1,3})\s+(.*)$/);
    if (titulo) {
      despejar();
      const nivel = titulo[1].length;
      saida.push(
        new Paragraph({
          children: [new TextRun({ text: titulo[2].replace(/\*\*/g, ""), bold: true, font: FONTE, size: nivel === 1 ? 28 : nivel === 2 ? 24 : TAMANHO })],
          heading: nivel === 1 ? HeadingLevel.HEADING_1 : nivel === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          alignment: nivel === 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
          spacing: { before: 240, after: 160 },
        }),
      );
      continue;
    }
    const lista = linha.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/);
    if (lista) {
      despejar();
      const numerada = /^\s*\d/.test(linha);
      saida.push(new Paragraph({ children: trechosInline(lista[1]), alignment: AlignmentType.JUSTIFIED, spacing: { after: 80, line: 320 }, indent: { left: 720, hanging: 360 }, ...(numerada ? {} : { bullet: { level: 0 } }) }));
      continue;
    }
    const citacao = linha.match(/^>\s?(.*)$/);
    if (citacao) {
      despejar();
      saida.push(new Paragraph({ children: trechosInline(citacao[1]).map((r) => r), alignment: AlignmentType.JUSTIFIED, indent: { left: 720 }, spacing: { after: 120, line: 300 } }));
      continue;
    }
    buffer.push(linha.trim());
  }
  despejar();
  return saida;
}

export function documentoComTimbre(md: string, timbre: Timbre, opcoes: { titulo?: string } = {}): Document {
  const { cabecalho, rodape } = linhasTimbre(timbre);
  return new Document({
    creator: timbre.nome || "Assistente Jurídica",
    title: opcoes.titulo ?? "Documento",
    styles: { default: { document: { run: { font: FONTE, size: TAMANHO } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1400, bottom: 1200, left: 1400, right: 1200 } } },
        headers: {
          default: new Header({
            children: cabecalho.map((l, i) => new Paragraph({ children: [new TextRun({ text: l, bold: i === 0, font: FONTE, size: i === 0 ? 22 : 18, color: "333333" })], alignment: AlignmentType.CENTER })),
          }),
        },
        footers: {
          default: new Footer({
            children: [
              ...rodape.map((l) => new Paragraph({ children: [new TextRun({ text: l, font: FONTE, size: 16, color: "555555" })], alignment: AlignmentType.CENTER })),
              new Paragraph({ children: [new TextRun({ children: ["Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES], font: FONTE, size: 16, color: "555555" })], alignment: AlignmentType.CENTER }),
            ],
          }),
        },
        children: paragrafosDoMarkdown(md),
      },
    ],
  });
}

export async function markdownParaDocx(md: string, timbre: Timbre, opcoes: { titulo?: string } = {}): Promise<Uint8Array> {
  const doc = documentoComTimbre(md, timbre, opcoes);
  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}
