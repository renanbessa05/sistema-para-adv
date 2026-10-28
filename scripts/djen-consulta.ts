/**
 * Consulta o DJEN por OAB e período e imprime tabela ou JSON.
 *
 *   tsx scripts/djen-consulta.ts --oab 12345 --uf MT --dias 30 [--tribunal TJMT] [--json]
 *
 * Lê DJEN_BASE_URL do ambiente (padrão https://comunicaapi.pje.jus.br).
 * Sem bibliotecas: só process.argv e o cliente puro de src/lib/djen.
 */
import { criarClienteDjen, DJEN_BASE_URL_PADRAO, ErroDjen, hashDedup, normalizarPublicacaoDjen } from "../src/lib/djen";

function lerArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const chave = a.slice(2);
    const proximo = argv[i + 1];
    if (proximo === undefined || proximo.startsWith("--")) {
      args[chave] = true;
    } else {
      args[chave] = proximo;
      i += 1;
    }
  }
  return args;
}

function dataIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function cortar(texto: string, largura: number): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > largura ? `${limpo.slice(0, largura - 1)}…` : limpo;
}

function coluna(texto: string | null | undefined, largura: number): string {
  return cortar(texto ?? "", largura).padEnd(largura);
}

async function main(): Promise<void> {
  const args = lerArgs(process.argv.slice(2));
  const oab = typeof args.oab === "string" ? args.oab : undefined;
  const uf = typeof args.uf === "string" ? args.uf.toUpperCase() : undefined;
  const dias = Number(typeof args.dias === "string" ? args.dias : "30");
  const tribunal = typeof args.tribunal === "string" ? args.tribunal.toUpperCase() : undefined;
  const comoJson = args.json === true;

  if (!oab || !uf) {
    console.error("Uso: tsx scripts/djen-consulta.ts --oab 12345 --uf MT --dias 30 [--tribunal TJMT] [--json]");
    process.exit(2);
  }
  if (!Number.isInteger(dias) || dias < 1) {
    console.error("--dias deve ser um inteiro positivo.");
    process.exit(2);
  }

  const fim = new Date();
  const inicio = new Date(fim.getTime() - dias * 24 * 60 * 60 * 1000);

  const cliente = criarClienteDjen({ baseUrl: process.env.DJEN_BASE_URL ?? DJEN_BASE_URL_PADRAO });

  const resultado = await cliente.consultarTodas({
    numeroOab: oab,
    ufOab: uf,
    siglaTribunal: tribunal,
    dataDisponibilizacaoInicio: dataIso(inicio),
    dataDisponibilizacaoFim: dataIso(fim),
  });

  const publicacoes = resultado.items
    .map(normalizarPublicacaoDjen)
    .sort((a, b) => (a.data_disponibilizacao ?? "").localeCompare(b.data_disponibilizacao ?? ""));

  if (comoJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          consulta: { oab, uf, tribunal: tribunal ?? null, inicio: dataIso(inicio), fim: dataIso(fim) },
          count: resultado.count,
          paginas: resultado.paginas,
          truncado: resultado.truncado,
          rate_limit: cliente.ultimoRateLimit,
          publicacoes: publicacoes.map((p) => ({ ...p, hash_dedup: hashDedup(p), payload_bruto: undefined })),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  console.log(
    `DJEN: OAB ${oab}/${uf}${tribunal ? ` · ${tribunal}` : ""} · ${dataIso(inicio)} a ${dataIso(fim)} · ${publicacoes.length} publicação(ões)` +
      `${resultado.count !== null && resultado.count !== publicacoes.length ? ` (count informado: ${resultado.count})` : ""}` +
      `${resultado.truncado ? " · TRUNCADO pelo teto" : ""}`,
  );
  if (cliente.ultimoRateLimit) {
    console.log(`Rate limit: ${cliente.ultimoRateLimit.restante ?? "?"}/${cliente.ultimoRateLimit.limite ?? "?"} restantes`);
  }
  console.log("");
  const cab = `${coluna("Data", 10)} ${coluna("Trib.", 6)} ${coluna("Tipo", 12)} ${coluna("Processo", 25)} ${coluna("Órgão", 32)} Texto`;
  console.log(cab);
  console.log("-".repeat(cab.length + 60));
  for (const p of publicacoes) {
    const tipo = `${p.tipo_origem ?? ""}${p.cancelada ? " (CANC.)" : ""}`;
    console.log(
      `${coluna(p.data_disponibilizacao, 10)} ${coluna(p.tribunal_sigla, 6)} ${coluna(tipo, 12)} ${coluna(p.numero_processo_texto, 25)} ${coluna(p.orgao, 32)} ${cortar(p.texto, 80)}`,
    );
  }
}

main().catch((erro: unknown) => {
  if (erro instanceof ErroDjen) {
    console.error(`Erro DJEN (${erro.status ?? "sem status"}): ${erro.message}`);
    if (erro.corpo) console.error(erro.corpo);
  } else {
    console.error(erro);
  }
  process.exit(1);
});
