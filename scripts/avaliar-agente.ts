/**
 * Avaliação de agente (lote 10; docs/regras/avaliacao-ia.md).
 *
 *   tsx scripts/avaliar-agente.ts --agente outros_tribunais            modo falso: sem API, valida casos e rubricas
 *   tsx scripts/avaliar-agente.ts --agente julgador --real             chama a API; exige ANTHROPIC_API_KEY e IA_TESTE_REAL=1
 *   ... --gravar --escritorio <uuid>                                   grava em ia_avaliacoes (SUPABASE_SERVICE_ROLE_KEY)
 *   ... --json                                                         imprime o resultado em JSON
 *
 * Sai com código 1 quando algum caso não bate com o esperado. Rode a partir da raiz do repositório.
 * O modo real NÃO é executado no CI; o custo da chamada à API não passa pela porta única (executarAgente), por isso
 * `custo_usd` fica zerado e o gasto real deve ser conferido no painel do provedor.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { criarClienteIa, type ClienteIa } from "../src/lib/ia/cliente";
import { AGENTES, type NomeAgente } from "../src/lib/ia/agentes/registro";
import { envServidor } from "../src/lib/config/env";
import { AGENTES_AVALIAVEIS, SCHEMAS_AVALIACAO } from "../src/lib/ia/avaliacao/agentes";
import { ArquivoCasosSchema, type Caso } from "../src/lib/ia/avaliacao/casos";
import { avaliarCaso, resumirAvaliacao, type ResultadoCaso } from "../src/lib/ia/avaliacao/avaliar";
import { montarPedidoJuiz } from "../src/lib/ia/avaliacao/rubricas";
import { VeredictoSchema, type Veredicto } from "../src/lib/ia/schemas/juiz-avaliacao";

function lerArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const proximo = argv[i + 1];
    if (proximo === undefined || proximo.startsWith("--")) args[a.slice(2)] = true;
    else {
      args[a.slice(2)] = proximo;
      i += 1;
    }
  }
  return args;
}

function sair(mensagem: string): never {
  console.error(mensagem);
  process.exit(2);
}

async function main() {
  const args = lerArgs(process.argv.slice(2));
  const nome = typeof args.agente === "string" ? args.agente : "";
  const def = AGENTES_AVALIAVEIS[nome];
  if (!def) sair(`--agente inválido. Opções: ${Object.keys(AGENTES_AVALIAVEIS).join(", ")}`);
  const real = args.real === true;
  const gravar = args.gravar === true;
  const escritorio = typeof args.escritorio === "string" ? args.escritorio : null;
  if (gravar && !escritorio) sair("--gravar exige --escritorio <uuid>");

  const arquivo = path.resolve(process.cwd(), "tests/avaliacao", nome, "casos.json");
  const dados = ArquivoCasosSchema.parse(JSON.parse(readFileSync(arquivo, "utf8")));

  let cliente: ClienteIa | null = null;
  if (real) {
    const chave = process.env.ANTHROPIC_API_KEY;
    if (!chave) sair("--real exige ANTHROPIC_API_KEY no ambiente");
    if (process.env.IA_TESTE_REAL !== "1") sair("--real exige IA_TESTE_REAL=1 (teste contra a API, orçamento combinado)");
    cliente = criarClienteIa({ apiKey: chave, timeoutMs: envServidor().IA_TIMEOUT_MS });
  }

  const registro = AGENTES[nome as NomeAgente];
  const modeloAgente = envServidor()[registro.modeloEnv];
  const modeloJuiz = envServidor()[AGENTES.juiz_avaliacao.modeloEnv];
  const resultados: ResultadoCaso[] = [];
  const tokens = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };

  for (const caso of dados.casos as Caso[]) {
    let saida: unknown = caso.saidaFalsa;
    let erro: string | null = null;
    const veredictos: Record<string, Veredicto> = {};

    if (cliente) {
      try {
        const r = await cliente.gerarEstruturado({
          modelo: modeloAgente,
          sistema: def.sistema,
          cacheSistema: registro.cacheSistema,
          usuario: caso.entrada.usuario,
          schema: def.schema,
          maxTokens: registro.maxTokens,
          effort: registro.effort,
          agente: nome,
        });
        saida = r.dados;
        somarUso(tokens, r.uso);
      } catch (e) {
        erro = e instanceof Error ? e.message : String(e);
      }
      if (!erro) {
        for (const rubrica of caso.rubricas) {
          if (rubrica.tipo !== "juiz") continue;
          try {
            const pedido = montarPedidoJuiz(rubrica.criterio, saida);
            const r = await cliente.gerarEstruturado({
              modelo: modeloJuiz,
              sistema: pedido.sistema,
              cacheSistema: true,
              usuario: pedido.usuario,
              schema: VeredictoSchema,
              maxTokens: AGENTES.juiz_avaliacao.maxTokens,
              agente: "juiz_avaliacao",
            });
            veredictos[rubrica.criterio] = r.dados;
            somarUso(tokens, r.uso);
          } catch (e) {
            erro = `juiz: ${e instanceof Error ? e.message : String(e)}`;
          }
        }
      }
    } else {
      Object.assign(veredictos, caso.juizFalso ?? {});
    }

    resultados.push(avaliarCaso(caso, saida, { schemas: SCHEMAS_AVALIACAO, veredictos, erro }));
  }

  const resumo = resumirAvaliacao(resultados);
  const modo = cliente ? "real" : "falso";
  const modelo = cliente ? modeloAgente : null;

  if (gravar && escritorio) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const chaveServico = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (!url || !chaveServico) sair("--gravar exige NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente");
    const admin = createClient(url, chaveServico, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.from("ia_avaliacoes").insert({
      escritorio_id: escritorio,
      agente: nome,
      agente_versao: def.versao,
      modo,
      modelo,
      total_casos: resumo.total,
      casos_ok: resumo.casosOk,
      situacao: resumo.situacao,
      custo_usd: 0,
      detalhes: resultados,
    });
    if (error) sair(`falha ao gravar: ${error.message}`);
  }

  if (args.json === true) {
    console.log(JSON.stringify({ agente: nome, versao: def.versao, modo, modelo, tokens: cliente ? tokens : null, resumo, resultados }, null, 2));
  } else {
    console.log(`Agente ${nome} (${def.versao}), modo ${modo}${modelo ? `, modelo ${modelo}` : ""}`);
    for (const r of resultados) {
      const marca = r.ok ? "OK  " : "FALHA";
      console.log(`${marca} ${r.id} (resultado ${r.resultado}, esperado ${r.esperado})${r.erro ? ` erro: ${r.erro}` : ""}`);
      for (const x of r.rubricas.filter((x) => !x.ok)) console.log(`       - ${x.tipo}: ${x.motivo}`);
    }
    console.log(`Casos batendo com o esperado: ${resumo.casosOk}/${resumo.total}. Situação: ${resumo.situacao}.`);
    if (cliente) console.log(`Tokens: entrada ${tokens.input}, saída ${tokens.output}, cache criação ${tokens.cacheWrite}, cache leitura ${tokens.cacheRead}.`);
  }
  process.exit(resumo.situacao === "aprovada" ? 0 : 1);
}

function somarUso(acum: { input: number; output: number; cacheWrite: number; cacheRead: number }, uso: { input: number; output: number; cacheWrite: number; cacheRead: number }) {
  acum.input += uso.input;
  acum.output += uso.output;
  acum.cacheWrite += uso.cacheWrite;
  acum.cacheRead += uso.cacheRead;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
