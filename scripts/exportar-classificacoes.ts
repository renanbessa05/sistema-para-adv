/**
 * Exporta as publicações classificadas para a advogada rotular (acerto do tipo e do prazo),
 * e converte a planilha rotulada em fixture de regressão do classificador.
 *
 *   DATABASE_URL=... pnpm tsx scripts/exportar-classificacoes.ts exportar --de 2026-11-03 --ate 2026-11-14 --saida rotulos.csv
 *   pnpm tsx scripts/exportar-classificacoes.ts importar --planilha rotulos.csv   # grava tests/fixtures/publicacoes-rotuladas.json
 *
 * Colunas do CSV: id;data;processo;tipo_ia;ato_ia;dias_ia;dobro_ia;confianca;resumo_ia;tipo_correto;gera_prazo_correto;dias_corretos;observacao
 * A advogada preenche as três colunas "correto(s)". Linhas em branco = concorda com a IA.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const celula = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

async function exportar() {
  const url = process.env.DATABASE_URL;
  const de = arg("de");
  const ate = arg("ate");
  const saida = arg("saida") ?? "rotulos.csv";
  if (!url || !de || !ate) throw new Error("Defina DATABASE_URL, --de e --ate");
  const client = new Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query(
    `select p.id, p.data_disponibilizacao::text as data, p.numero_cnj, p.tipo::text as tipo_ia, p.classificacao, p.confianca_ia, p.resumo_ia, p.texto
       from public.publicacoes p
      where p.data_disponibilizacao between $1 and $2 and p.classificacao is not null
      order by p.data_disponibilizacao, p.id`,
    [de, ate],
  );
  await client.end();
  const cab = ["id", "data", "processo", "tipo_ia", "ato_ia", "dias_ia", "dobro_ia", "confianca", "resumo_ia", "tipo_correto", "gera_prazo_correto", "dias_corretos", "observacao"];
  const linhas = [cab.join(";")];
  for (const r of rows) {
    const c = (r.classificacao ?? {}) as Record<string, unknown>;
    linhas.push([r.id, r.data, r.numero_cnj, r.tipo_ia, c.ato, c.dias_sugeridos, c.dobro, r.confianca_ia, r.resumo_ia, "", "", "", ""].map(celula).join(";"));
  }
  writeFileSync(saida, "﻿" + linhas.join("\r\n"), "utf8");
  // Texto completo em arquivo separado (JSON) para montar a fixture depois
  writeFileSync(saida.replace(/\.csv$/, "") + ".textos.json", JSON.stringify(rows.map((r) => ({ id: r.id, texto: r.texto, classificacao: r.classificacao })), null, 1), "utf8");
  console.log(`${rows.length} publicações exportadas para ${saida}`);
}

function importar() {
  const planilha = arg("planilha");
  if (!planilha) throw new Error("--planilha obrigatório");
  const texto = readFileSync(planilha, "utf8").replace(/^﻿/, "");
  const textos = JSON.parse(readFileSync(planilha.replace(/\.csv$/, "") + ".textos.json", "utf8")) as { id: string; texto: string; classificacao: Record<string, unknown> }[];
  const porId = new Map(textos.map((t) => [t.id, t]));
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  const cab = linhas[0].split(";").map((c) => c.trim().toLowerCase());
  const idx = (n: string) => cab.indexOf(n);
  const casos = linhas.slice(1).map((l) => {
    const c = l.split(";").map((x) => x.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
    const id = c[idx("id")];
    const t = porId.get(id);
    const tipoIa = c[idx("tipo_ia")];
    const tipoCorreto = c[idx("tipo_correto")] || tipoIa;
    const geraPrazoIa = Boolean(t?.classificacao?.gera_prazo);
    const geraPrazoCorreto = c[idx("gera_prazo_correto")] ? /^(s|sim|true|1)$/i.test(c[idx("gera_prazo_correto")]) : geraPrazoIa;
    const diasCorretos = c[idx("dias_corretos")] ? Number(c[idx("dias_corretos")]) : (t?.classificacao?.dias_sugeridos as number | null) ?? null;
    return { id, texto: t?.texto ?? "", esperado: { tipo: tipoCorreto, gera_prazo: geraPrazoCorreto, dias_sugeridos: diasCorretos }, observacao: c[idx("observacao")] || null };
  });
  const destino = path.resolve(__dirname, "..", "tests", "fixtures", "publicacoes-rotuladas.json");
  const atual = JSON.parse(readFileSync(destino, "utf8")) as { casos: unknown[] };
  const existentes = new Set((atual.casos as { id: string }[]).map((c) => c.id));
  const novos = casos.filter((c) => !existentes.has(c.id));
  writeFileSync(destino, JSON.stringify({ ...atual, casos: [...atual.casos, ...novos] }, null, 1), "utf8");
  console.log(`${novos.length} casos novos na fixture (${atual.casos.length + novos.length} no total)`);
}

const comando = process.argv[2];
(comando === "exportar" ? exportar() : comando === "importar" ? Promise.resolve(importar()) : Promise.reject(new Error("Comando: exportar | importar"))).catch((e) => {
  console.error(e);
  process.exit(1);
});
