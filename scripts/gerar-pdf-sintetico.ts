/**
 * Gera autos sintéticos em PDF para testes e avaliação dos agentes (nenhum dado real).
 *
 * Uso: pnpm tsx scripts/gerar-pdf-sintetico.ts [--paginas 12] [--saida tests/fixtures/documentos/autos-sintetico-12p.pdf]
 * As páginas 1, 5 e 9 começam com cabeçalhos de peças (petição inicial, decisão, sentença) para o inventário.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function arg(nome: string, padrao: string): string {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

const totalPaginas = Number(arg("paginas", "12"));
const saida = path.resolve(arg("saida", "tests/fixtures/documentos/autos-sintetico-12p.pdf"));

function cabecalho(n: number): string {
  if (n === 1) return "EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 1ª VARA CÍVEL DA COMARCA DE CUIABÁ - ESTADO DE MATO GROSSO";
  if (n === 5) return "DECISÃO";
  if (n === 9) return "SENTENÇA";
  return `Num. ${100000000 + n} - Pág. ${n}`;
}

function corpo(n: number): string {
  if (n === 1) {
    return "Processo nº 1002345-67.2025.8.11.0041. MARINA SILVA, brasileira, solteira, auxiliar administrativa, inscrita no CPF sob o nº 000.000.000-00, por sua advogada, vem propor AÇÃO DE INDENIZAÇÃO POR DANOS MORAIS em face de LOJAS EXEMPLO LTDA., CNPJ 00.000.000/0001-00, pelos fatos e fundamentos a seguir. Dos fatos: em 10/03/2025 a autora teve o nome inscrito indevidamente nos cadastros de inadimplentes (Doc. 01). Em 15/03/2025 notificou a ré (Doc. 02).";
  }
  if (n === 5) return "Vistos. Defiro a gratuidade da justiça. Cite-se a parte requerida para contestar no prazo legal. Intime-se. Cuiabá, 02/06/2025.";
  if (n === 9) return "Vistos etc. Trata-se de ação de indenização por danos morais. É o relatório. Fundamento e decido. A inscrição indevida está comprovada pelo Doc. 01. JULGO PROCEDENTE o pedido para condenar a ré ao pagamento de R$ 8.000,00 a título de danos morais, corrigidos pelo INPC desde o arbitramento e com juros de 1% ao mês desde o evento danoso. Publique-se. Registre-se. Intimem-se.";
  return `Documento juntado aos autos, página ${n}. Certidão: certifico que a publicação foi disponibilizada no DJEN em ${String(10 + (n % 10)).padStart(2, "0")}/0${1 + (n % 9)}/2025. Nada mais.`;
}

/** Quebra o texto em linhas que cabem na largura (fonte Helvetica, sem hifenização). */
function quebrar(texto: string, largura: number, tamanho: number, medir: (t: string, s: number) => number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (medir(tentativa, tamanho) <= largura) {
      atual = tentativa;
    } else {
      if (atual) linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

async function gerar() {
  const pdf = await PDFDocument.create();
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const fonteNegrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margem = 56;
  for (let n = 1; n <= totalPaginas; n += 1) {
    const pagina = pdf.addPage([595.28, 841.89]); // A4
    const largura = pagina.getWidth() - 2 * margem;
    let y = pagina.getHeight() - margem;
    for (const linha of quebrar(cabecalho(n), largura, 12, (t, s) => fonteNegrito.widthOfTextAtSize(t, s))) {
      pagina.drawText(linha, { x: margem, y, size: 12, font: fonteNegrito, color: rgb(0, 0, 0) });
      y -= 16;
    }
    y -= 10;
    for (const linha of quebrar(corpo(n), largura, 11, (t, s) => fonte.widthOfTextAtSize(t, s))) {
      pagina.drawText(linha, { x: margem, y, size: 11, font: fonte, color: rgb(0.1, 0.1, 0.1) });
      y -= 15;
    }
    pagina.drawText(`página ${n} de ${totalPaginas}`, { x: pagina.getWidth() - margem - 90, y: 30, size: 9, font: fonte, color: rgb(0.4, 0.4, 0.4) });
  }
  const bytes = await pdf.save();
  mkdirSync(path.dirname(saida), { recursive: true });
  writeFileSync(saida, bytes);
  console.log(`PDF sintético com ${totalPaginas} páginas em ${saida} (${bytes.byteLength} bytes)`);
}

gerar().catch((e) => {
  console.error(e);
  process.exit(1);
});
