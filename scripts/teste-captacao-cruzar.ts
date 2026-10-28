/**
 * Cruza a planilha do teste de captação (o que a equipe viu no PJe/e-mail) com as publicações captadas do DJEN.
 *
 *   DATABASE_URL=postgres://... pnpm tsx scripts/teste-captacao-cruzar.ts --planilha teste.csv --de 2026-11-03 --ate 2026-11-14 [--escritorio <uuid>]
 *
 * Saída: três grupos (ambos / só DJEN / só PJe-e-mail) com latência de captação em horas.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { extrairDigitosCnj } from "../src/lib/cnj/numero-cnj";

interface LinhaPlanilha {
  data_vista: string;
  numero_cnj: string | null;
  meio: string;
  tipo: string;
  data_disponibilizacao: string;
  observacao: string;
}

export function lerPlanilha(texto: string): LinhaPlanilha[] {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length === 0) return [];
  const sep = linhas[0].includes(";") ? ";" : ",";
  const cab = linhas[0].split(sep).map((c) => c.trim().toLowerCase());
  const idx = (nome: string) => cab.indexOf(nome);
  return linhas.slice(1).map((l) => {
    const c = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""));
    return {
      data_vista: c[idx("data_vista")] ?? "",
      numero_cnj: extrairDigitosCnj(c[idx("numero_cnj")] ?? ""),
      meio: c[idx("meio")] ?? "",
      tipo: c[idx("tipo")] ?? "",
      data_disponibilizacao: c[idx("data_disponibilizacao")] ?? "",
      observacao: c[idx("observacao")] ?? "",
    };
  });
}

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function principal() {
  const planilha = arg("planilha");
  const de = arg("de");
  const ate = arg("ate");
  if (!planilha || !de || !ate) {
    console.error("Uso: --planilha arquivo.csv --de AAAA-MM-DD --ate AAAA-MM-DD [--escritorio uuid]");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Defina DATABASE_URL");
    process.exit(1);
  }
  const vistas = lerPlanilha(readFileSync(planilha, "utf8"));
  const client = new Client({ connectionString: url });
  await client.connect();
  const escritorio = arg("escritorio");
  const { rows: captadas } = await client.query<{ numero_cnj: string | null; data_disponibilizacao: string; criado_em: string; tipo: string | null; status: string }>(
    `select numero_cnj, data_disponibilizacao::text, criado_em::text, tipo::text, status::text
       from public.publicacoes
      where fonte = 'djen' and data_disponibilizacao between $1 and $2 ${escritorio ? "and escritorio_id = $3" : ""}`,
    escritorio ? [de, ate, escritorio] : [de, ate],
  );
  await client.end();

  const chave = (cnj: string | null, data: string) => `${cnj ?? "?"}|${data.slice(0, 10)}`;
  const mapaCaptadas = new Map<string, (typeof captadas)[number]>();
  for (const c of captadas) mapaCaptadas.set(chave(c.numero_cnj, c.data_disponibilizacao), c);
  const mapaVistas = new Map<string, LinhaPlanilha>();
  for (const v of vistas) mapaVistas.set(chave(v.numero_cnj, v.data_disponibilizacao), v);

  const ambos: string[] = [];
  const soDjen: string[] = [];
  const soPje: string[] = [];
  for (const [k, v] of mapaVistas) {
    const c = mapaCaptadas.get(k);
    if (c) {
      const latencia = (new Date(c.criado_em).getTime() - new Date(`${c.data_disponibilizacao}T00:00:00-04:00`).getTime()) / 3_600_000;
      ambos.push(`${k}  ${v.meio}  captada após ${latencia.toFixed(1)} h (status ${c.status})`);
    } else {
      soPje.push(`${k}  ${v.meio}  ${v.tipo}  ${v.observacao}`);
    }
  }
  for (const [k, c] of mapaCaptadas) if (!mapaVistas.has(k)) soDjen.push(`${k}  ${c.tipo ?? ""}  (${c.status})`);

  console.log(`\nAMBOS (${ambos.length})\n${ambos.join("\n")}`);
  console.log(`\nSÓ DJEN (${soDjen.length})\n${soDjen.join("\n")}`);
  console.log(`\nSÓ PJE/E-MAIL (${soPje.length}) → cada uma precisa de causa\n${soPje.join("\n")}`);
  const cobertura = vistas.length ? (ambos.length / vistas.length) * 100 : 100;
  console.log(`\nCobertura do DJEN sobre o que foi visto: ${cobertura.toFixed(1)}%`);
}

if (require.main === module) {
  principal().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
