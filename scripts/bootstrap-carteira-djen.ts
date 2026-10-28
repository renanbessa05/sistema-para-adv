/**
 * Bootstrap da carteira: lista os processos com publicação no DJEN para a OAB
 * nos últimos N dias e gera um CSV-rascunho para a advogada completar
 * (cliente, polo, parte contrária, comarca, responsável, colaboradores, sigilo, fase).
 *
 *   tsx scripts/bootstrap-carteira-djen.ts --oab 12345 --uf MT --dias 180 --saida carteira-rascunho.csv [--tribunal TJMT]
 *
 * CSV com ";" como separador e BOM UTF-8 (abre direto no Excel em pt-BR).
 */
import { writeFileSync } from "node:fs";
import { criarClienteDjen, DJEN_BASE_URL_PADRAO, ErroDjen, mascararCnj, normalizarPublicacaoDjen, type PublicacaoNormalizada } from "../src/lib/djen";

const COLUNAS = [
  "numero_cnj",
  "numero_mascara",
  "tribunal",
  "classe",
  "orgao",
  "ultima_publicacao",
  "partes_vistas",
  "cliente",
  "polo",
  "parte_contraria",
  "comarca",
  "responsavel",
  "colaboradores",
  "sigiloso",
  "fase",
  "observacoes",
] as const;

function lerArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const proximo = argv[i + 1];
    if (proximo === undefined || proximo.startsWith("--")) {
      args[a.slice(2)] = true;
    } else {
      args[a.slice(2)] = proximo;
      i += 1;
    }
  }
  return args;
}

function dataIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Escapa um valor para CSV com ";" (aspas quando há ; " ou quebra de linha). */
export function celulaCsv(valor: string | null | undefined): string {
  const v = (valor ?? "").replace(/\r?\n/g, " ");
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

interface LinhaCarteira {
  numero_cnj: string;
  numero_mascara: string;
  tribunal: string;
  classe: string;
  orgao: string;
  ultima_publicacao: string;
  partes_vistas: Set<string>;
}

/** Agrupa publicações por número CNJ (ignora as sem número e as canceladas). */
export function agruparPorProcesso(publicacoes: PublicacaoNormalizada[]): LinhaCarteira[] {
  const porNumero = new Map<string, LinhaCarteira>();
  for (const p of publicacoes) {
    if (!p.numero_cnj || p.cancelada) continue;
    const atual = porNumero.get(p.numero_cnj);
    const data = p.data_disponibilizacao ?? "";
    if (!atual) {
      porNumero.set(p.numero_cnj, {
        numero_cnj: p.numero_cnj,
        numero_mascara: p.numero_processo_texto && /\D/.test(p.numero_processo_texto) ? p.numero_processo_texto : mascararCnj(p.numero_cnj),
        tribunal: p.tribunal_sigla ?? "",
        classe: p.classe_nome ?? "",
        orgao: p.orgao ?? "",
        ultima_publicacao: data,
        partes_vistas: new Set(p.destinatarios.map((d) => d.nome).filter((n): n is string => !!n)),
      });
      continue;
    }
    if (data > atual.ultima_publicacao) {
      atual.ultima_publicacao = data;
      // Classe e órgão mais recentes prevalecem (o processo pode ter subido de grau).
      if (p.classe_nome) atual.classe = p.classe_nome;
      if (p.orgao) atual.orgao = p.orgao;
    }
    for (const d of p.destinatarios) if (d.nome) atual.partes_vistas.add(d.nome);
  }
  return [...porNumero.values()].sort((a, b) => b.ultima_publicacao.localeCompare(a.ultima_publicacao) || a.numero_cnj.localeCompare(b.numero_cnj));
}

export function gerarCsv(linhas: LinhaCarteira[]): string {
  const saida: string[] = [COLUNAS.join(";")];
  for (const l of linhas) {
    saida.push(
      [
        l.numero_cnj,
        l.numero_mascara,
        l.tribunal,
        l.classe,
        l.orgao,
        l.ultima_publicacao,
        [...l.partes_vistas].join("; "),
        "", // cliente
        "", // polo
        "", // parte_contraria
        "", // comarca
        "", // responsavel
        "", // colaboradores
        "", // sigiloso
        "", // fase
        "", // observacoes
      ]
        .map(celulaCsv)
        .join(";"),
    );
  }
  return `﻿${saida.join("\r\n")}\r\n`;
}

async function main(): Promise<void> {
  const args = lerArgs(process.argv.slice(2));
  const oab = typeof args.oab === "string" ? args.oab : undefined;
  const uf = typeof args.uf === "string" ? args.uf.toUpperCase() : undefined;
  const dias = Number(typeof args.dias === "string" ? args.dias : "180");
  const saida = typeof args.saida === "string" ? args.saida : "carteira-rascunho.csv";
  const tribunal = typeof args.tribunal === "string" ? args.tribunal.toUpperCase() : undefined;

  if (!oab || !uf || !Number.isInteger(dias) || dias < 1) {
    console.error("Uso: tsx scripts/bootstrap-carteira-djen.ts --oab 12345 --uf MT --dias 180 --saida carteira-rascunho.csv [--tribunal TJMT]");
    process.exit(2);
  }

  const fim = new Date();
  const inicio = new Date(fim.getTime() - dias * 24 * 60 * 60 * 1000);
  const cliente = criarClienteDjen({ baseUrl: process.env.DJEN_BASE_URL ?? DJEN_BASE_URL_PADRAO });

  console.log(`Consultando DJEN: OAB ${oab}/${uf}${tribunal ? ` · ${tribunal}` : ""} · ${dataIso(inicio)} a ${dataIso(fim)} ...`);
  const resultado = await cliente.consultarTodas({
    numeroOab: oab,
    ufOab: uf,
    siglaTribunal: tribunal,
    dataDisponibilizacaoInicio: dataIso(inicio),
    dataDisponibilizacaoFim: dataIso(fim),
  });
  if (resultado.truncado) {
    console.warn("Atenção: resultado truncado pelo teto de 10.000 itens. Reduza --dias ou filtre por --tribunal.");
  }

  const publicacoes = resultado.items.map(normalizarPublicacaoDjen);
  const semNumero = publicacoes.filter((p) => !p.numero_cnj).length;
  const linhas = agruparPorProcesso(publicacoes);

  writeFileSync(saida, gerarCsv(linhas), { encoding: "utf8" });
  console.log(`${publicacoes.length} publicação(ões) em ${resultado.paginas} página(s); ${linhas.length} processo(s) distinto(s).`);
  if (semNumero > 0) console.log(`${semNumero} publicação(ões) sem número CNJ reconhecível foram ignoradas.`);
  console.log(`CSV gravado em ${saida} (separador ";", UTF-8 com BOM). Preencha cliente, polo, parte_contraria, comarca, responsavel, colaboradores, sigiloso e fase.`);
}

// Só executa quando chamado diretamente (permite importar as funções em testes).
const chamadoDiretamente = process.argv[1]?.endsWith("bootstrap-carteira-djen.ts") ?? false;
if (chamadoDiretamente) {
  main().catch((erro: unknown) => {
    if (erro instanceof ErroDjen) {
      console.error(`Erro DJEN (${erro.status ?? "sem status"}): ${erro.message}`);
      if (erro.corpo) console.error(erro.corpo);
    } else {
      console.error(erro);
    }
    process.exit(1);
  });
}
