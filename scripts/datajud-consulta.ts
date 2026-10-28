/**
 * Consulta um processo no DataJud e imprime resumo e os últimos 10 movimentos.
 *
 *   tsx scripts/datajud-consulta.ts <numeroCNJ> [--json] [--alias api_publica_tjmt]
 *
 * Lê DATAJUD_API_KEY (obrigatória) e DATAJUD_BASE_URL (padrão oficial) do ambiente.
 */
import { criarClienteDatajud, DATAJUD_ALIAS_TJMT, DATAJUD_BASE_URL_PADRAO, ErroDatajud } from "../src/lib/datajud";
import { mascararCnj } from "../src/lib/djen/cnj-local";

function lerArgs(argv: string[]): { posicionais: string[]; opcoes: Record<string, string | boolean> } {
  const posicionais: string[] = [];
  const opcoes: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const proximo = argv[i + 1];
      if (proximo === undefined || proximo.startsWith("--")) {
        opcoes[a.slice(2)] = true;
      } else {
        opcoes[a.slice(2)] = proximo;
        i += 1;
      }
    } else {
      posicionais.push(a);
    }
  }
  return { posicionais, opcoes };
}

function dataLocal(iso: string | null): string {
  if (!iso) return "sem data";
  const d = new Date(iso);
  // Exibe em America/Cuiaba (UTC-4, sem horário de verão).
  return d.toLocaleString("pt-BR", { timeZone: "America/Cuiaba" });
}

async function main(): Promise<void> {
  const { posicionais, opcoes } = lerArgs(process.argv.slice(2));
  const numero = posicionais[0];
  if (!numero) {
    console.error("Uso: tsx scripts/datajud-consulta.ts <numeroCNJ> [--json] [--alias api_publica_tjmt]");
    process.exit(2);
  }
  const apiKey = process.env.DATAJUD_API_KEY;
  if (!apiKey) {
    console.error("Defina DATAJUD_API_KEY (chave pública da wiki do CNJ: https://datajud-wiki.cnj.jus.br/api-publica/acesso/).");
    process.exit(2);
  }
  const alias = typeof opcoes.alias === "string" ? opcoes.alias : DATAJUD_ALIAS_TJMT;

  const cliente = criarClienteDatajud({ baseUrl: process.env.DATAJUD_BASE_URL ?? DATAJUD_BASE_URL_PADRAO, apiKey });
  const processos = await cliente.buscarPorNumero(numero, { tribunalAlias: alias });

  if (opcoes.json === true) {
    process.stdout.write(`${JSON.stringify(processos?.map((p) => ({ ...p, payload_bruto: undefined })) ?? null, null, 2)}\n`);
    return;
  }

  if (!processos || processos.length === 0) {
    console.log(`Nenhum registro no DataJud (${alias}) para ${mascararCnj(numero)}. Pode ser sigiloso ou ainda não enviado pelo tribunal.`);
    return;
  }

  for (const p of processos) {
    console.log(`Processo ${mascararCnj(p.numero_cnj)} · ${p.tribunal ?? "?"} · grau ${p.grau ?? "?"}${p.sigiloso ? " · SIGILOSO" : ""}`);
    console.log(`  Classe: ${p.classe_nome ?? "?"} (${p.classe_codigo ?? "?"})`);
    console.log(`  Assuntos: ${p.assuntos.map((a) => `${a.nome ?? "?"} (${a.codigo ?? "?"})`).join("; ") || "-"}`);
    console.log(`  Órgão julgador: ${p.orgao_julgador_nome ?? "?"} · comarca ${p.comarca ?? `IBGE ${p.codigo_municipio_ibge ?? "?"} (a confirmar)`}`);
    console.log(`  Sistema/formato: ${p.sistema ?? "?"} / ${p.formato ?? "?"}`);
    console.log(`  Ajuizamento: ${p.data_ajuizamento ?? "?"} · última atualização no DataJud: ${dataLocal(p.ultima_atualizacao)}`);
    console.log(`  Movimentos: ${p.movimentos.length} (últimos 10)`);
    for (const m of p.movimentos.slice(0, 10)) {
      const compl = m.complementos.map((c) => `${c.descricao ?? c.codigo ?? "?"}=${c.nome ?? c.valor ?? "?"}`).join(", ");
      console.log(`    ${dataLocal(m.data_hora).padEnd(20)} ${String(m.codigo ?? "?").padStart(6)}  ${m.nome ?? "?"}${compl ? ` [${compl}]` : ""}`);
    }
    console.log("");
  }
}

main().catch((erro: unknown) => {
  if (erro instanceof ErroDatajud) {
    console.error(`Erro DataJud (${erro.status ?? "sem status"}): ${erro.message}`);
    if (erro.corpo) console.error(erro.corpo);
  } else {
    console.error(erro);
  }
  process.exit(1);
});
