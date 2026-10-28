/**
 * Código IBGE (7 dígitos) → nome do município-sede de comarca em Mato Grosso.
 *
 * O DataJud informa `orgaoJulgador.codigoMunicipioIBGE`; este mapa traduz para
 * o nome usado no cadastro de comarcas. Só entram pares conferidos com a tabela
 * de municípios do IBGE. Municípios de MT fora da lista (ou comarcas cujo código
 * não foi conferido) ficam em `PENDENTES_A_CONFIRMAR` e devolvem null.
 *
 * O mapa é extensível: `registrarComarca(codigo, nome)` acrescenta pares em
 * tempo de execução (por exemplo, vindos da tabela `ref.comarcas`).
 */

const COMARCAS_MT: Record<number, string> = {
  5103403: "Cuiabá",
  5108402: "Várzea Grande",
  5107602: "Rondonópolis",
  5107909: "Sinop",
  5107925: "Sorriso",
  5107958: "Tangará da Serra",
  5102504: "Cáceres",
  5101803: "Barra do Garças",
  5105259: "Lucas do Rio Verde",
  5107040: "Primavera do Leste",
  5100250: "Alta Floresta",
  5105150: "Juína",
  5106224: "Nova Mutum",
  5102678: "Campo Verde",
  5104906: "Jaciara",
  5106752: "Pontes e Lacerda",
  5100201: "Água Boa",
  5102702: "Canarana",
  5103205: "Colíder",
  5103502: "Diamantino",
  5105622: "Mirassol d'Oeste",
  5104104: "Guarantã do Norte",
  5106422: "Peixoto de Azevedo",
  5105101: "Juara",
  5107875: "Sapezal",
  5102637: "Campo Novo do Parecis",
  5106257: "Nova Xavantina",
  5106505: "Poconé",
  5103007: "Chapada dos Guimarães",
  5101704: "Barra do Bugres",
  5106307: "Paranatinga",
  5100805: "Alto Araguaia",
  5108600: "Vila Rica",
  5103353: "Confresa",
  5107065: "Querência",
  5103304: "Comodoro",
  5106778: "Porto Alegre do Norte",
  5106109: "Nortelândia",
  5101001: "Arenápolis",
  5104807: "Itiquira",
  5106372: "Pedra Preta",
  5107008: "Poxoréu",
  5103601: "Dom Aquino",
  5105002: "Jauru",
  5107701: "Rosário Oeste",
  5107859: "São José dos Quatro Marcos",
  5100904: "Araputanga",
  5103379: "Cotriguaçu",
  5101407: "Aripuanã",
  5101902: "Brasnorte",
  5108006: "Tapurah",
  5105903: "Nobres",
  5106190: "Nova Canaã do Norte",
  5105580: "Marcelândia",
  5105606: "Matupá",
  5108055: "Terra Nova do Norte",
  5104542: "Itaúba",
  5103056: "Cláudia",
  5103700: "Feliz Natal",
  5108309: "Vera",
  5107248: "Santa Carmem",
  5107206: "Ribeirão Cascalheira",
};

/**
 * Comarcas de MT cujo código IBGE ainda não foi conferido (a confirmar).
 * Não entram no mapa até alguém checar em https://www.ibge.gov.br/explica/codigos-dos-municipios.php
 * e mover o par para `COMARCAS_MT`. São Félix do Araguaia é provavelmente 5107776 (a confirmar).
 */
export const PENDENTES_A_CONFIRMAR: readonly string[] = [
  "São Félix do Araguaia",
  "Alto Garças",
  "Alto Taquari",
  "Apiacás",
  "Nova Monte Verde",
  "Nova Olímpia",
  "Novo São Joaquim",
  "Porto dos Gaúchos",
  "Porto Esperidião",
  "Rio Branco",
  "São José do Rio Claro",
  "Tabaporã",
  "Cocalinho",
  "Guiratinga",
  "Araguaiana",
  "Nova Brasilândia",
  "Nova Ubiratã",
  "Novo Mundo",
  "Paranaíta",
  "Alto Boa Vista",
  "Santo Antônio do Leverger",
  "Barão de Melgaço",
  "Nossa Senhora do Livramento",
  "Vila Bela da Santíssima Trindade",
];

const extras = new Map<number, string>();

/** Devolve o nome do município-sede para o código IBGE, ou null se desconhecido. */
export function comarcaPorIbge(codigo: number | string | null | undefined): string | null {
  if (codigo === null || codigo === undefined) return null;
  const n = typeof codigo === "string" ? Number.parseInt(codigo, 10) : codigo;
  if (!Number.isInteger(n)) return null;
  return extras.get(n) ?? COMARCAS_MT[n] ?? null;
}

/** Acrescenta (ou sobrescreve) um par código → nome em tempo de execução. */
export function registrarComarca(codigo: number, nome: string): void {
  extras.set(codigo, nome);
}

/** Lista imutável dos pares conhecidos (para alimentar `ref.comarcas`, por exemplo). */
export function listarComarcasConhecidas(): ReadonlyArray<{ codigo_ibge: number; nome: string }> {
  const todos = new Map<number, string>(Object.entries(COMARCAS_MT).map(([k, v]) => [Number(k), v]));
  for (const [k, v] of extras) todos.set(k, v);
  return [...todos.entries()].map(([codigo_ibge, nome]) => ({ codigo_ibge, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
