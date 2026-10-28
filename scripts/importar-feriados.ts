/**
 * Importa feriados e suspensões para ref.feriados a partir de um CSV (separador ; ou ,):
 *   data;descricao;abrangencia;comarca;suspende_prazo;ato_normativo;url_fonte
 *   2027-02-08;Carnaval;forense;;true;Portaria TJMT/PRES xxxx/2026;https://...
 * abrangencia: nacional | estadual | municipal | forense | recesso | suspensao_ad_hoc
 * comarca: nome exato em ref.comarcas (obrigatório para municipal)
 *
 *   DATABASE_URL=postgres://... pnpm tsx scripts/importar-feriados.ts --arquivo feriados-2027.csv [--tribunal TJMT] [--conferido]
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function principal() {
  const arquivo = arg("arquivo");
  const url = process.env.DATABASE_URL;
  if (!arquivo || !url) {
    console.error("Uso: DATABASE_URL=... --arquivo feriados.csv [--tribunal TJMT] [--conferido]");
    process.exit(1);
  }
  const sigla = arg("tribunal") ?? "TJMT";
  const conferido = process.argv.includes("--conferido");
  const linhas = readFileSync(arquivo, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const sep = linhas[0].includes(";") ? ";" : ",";
  const cab = linhas[0].split(sep).map((c) => c.trim().toLowerCase());
  const idx = (n: string) => cab.indexOf(n);

  const client = new Client({ connectionString: url });
  await client.connect();
  const { rows: trib } = await client.query("select id from ref.tribunais where sigla = $1", [sigla]);
  if (!trib.length) throw new Error(`Tribunal ${sigla} não cadastrado`);
  const tribunalId = trib[0].id as string;
  const { rows: comarcas } = await client.query("select id, nome from ref.comarcas where tribunal_id = $1", [tribunalId]);
  const comarcaPorNome = new Map(comarcas.map((c) => [String(c.nome).toLowerCase(), c.id as string]));

  let inseridos = 0;
  const anos = new Set<number>();
  for (const l of linhas.slice(1)) {
    const c = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""));
    const data = c[idx("data")];
    const abrangencia = c[idx("abrangencia")] || "forense";
    const comarcaNome = c[idx("comarca")] || "";
    const comarcaId = comarcaNome ? comarcaPorNome.get(comarcaNome.toLowerCase()) : null;
    if (abrangencia === "municipal" && !comarcaId) {
      console.warn(`Comarca não encontrada, linha ignorada: ${l}`);
      continue;
    }
    const suspende = (c[idx("suspende_prazo")] || "true").toLowerCase() !== "false";
    const r = await client.query(
      `insert into ref.feriados (tribunal_id, comarca_id, data, descricao, abrangencia, suspende_prazo, ato_normativo, url_fonte, conferido)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (tribunal_id, comarca_id, data, descricao) do update set suspende_prazo = excluded.suspende_prazo, ato_normativo = excluded.ato_normativo, url_fonte = excluded.url_fonte, conferido = excluded.conferido`,
      [abrangencia === "nacional" ? null : tribunalId, comarcaId ?? null, data, c[idx("descricao")], abrangencia, suspende, c[idx("ato_normativo")] || null, c[idx("url_fonte")] || null, conferido],
    );
    inseridos += r.rowCount ?? 0;
    anos.add(Number(data.slice(0, 4)));
  }
  for (const ano of anos) {
    await client.query(
      `insert into ref.calendario_anos (tribunal_id, ano, conferido, atualizado_em) values ($1, $2, $3, now())
       on conflict (tribunal_id, ano) do update set conferido = excluded.conferido, atualizado_em = now()`,
      [tribunalId, ano, conferido],
    );
  }
  await client.end();
  console.log(`${inseridos} feriados gravados para ${sigla}; anos: ${[...anos].join(", ")}${conferido ? " (conferidos)" : ""}`);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
