# DataJud (API Pública do CNJ): campos, uso e status de verificação

Fonte: `POST https://api-publica.datajud.cnj.jus.br/api_publica_tjmt/_search`, header `Authorization: APIKey <chave pública da wiki>`. Resposta no formato Elasticsearch. Código em `src/lib/datajud`. Fatos e fontes em `docs/escopo-revisado.md`, Apêndice A.2.

**Status:** "verificado" = wiki do CNJ ou respostas reais publicadas; "a confirmar" = suposição a checar quando a rede liberar `api-publica.datajud.cnj.jus.br`. A chave pública **pode ser trocada pelo CNJ a qualquer momento**: fica em `DATAJUD_API_KEY` (configuração), e 401/403 geram erro claro sem retentativa.

## Envelope Elasticsearch

| Campo | Tipo | Como usamos | Status |
|---|---|---|---|
| `hits.total.value` | number (ou number direto em versões antigas) | Diagnóstico; `0` ⇒ `buscarPorNumero` devolve `null` | verificado |
| `hits.hits[]._source` | ProcessoDatajudSource | Um registro por grau do processo | verificado |
| `hits.hits[].sort` | unknown[] | Cursor de `search_after` (não usado: buscamos por número, `size` 10) | verificado |
| `took`, `timed_out`, `_shards` | | Ignorados | verificado |

## `_source`

| Campo | Tipo | Como usamos (`ProcessoDatajud`) | Status |
|---|---|---|---|
| `numeroProcesso` | string, 20 dígitos | `numero_cnj`; chave de junção com `publicacoes.numero_cnj` | verificado |
| `tribunal` | string (`"TJMT"`) | `tribunal` | verificado |
| `grau` | string (`"G1"`, `"G2"`…) | `grau`; pode haver um `_source` por grau | verificado; lista completa (`JE`, `TR`…) a confirmar |
| `classe.codigo` / `classe.nome` | number / string | `classe_codigo`, `classe_nome` (TPU) | verificado |
| `assuntos[].codigo` / `.nome` | number / string | `assuntos[]` (TPU) | verificado |
| `sistema.codigo` / `.nome` | number / string | `sistema` (nome: `"PJe"`) | verificado |
| `formato.codigo` / `.nome` | number / string | `formato` (`"Eletrônico"`) | verificado |
| `dataAjuizamento` | string ISO | `data_ajuizamento` (`YYYY-MM-DD`) | verificado; formato compacto `AAAAMMDDhhmmss` também aceito, a confirmar se ocorre |
| `dataHoraUltimaAtualizacao` | string ISO | `ultima_atualizacao`; mede o atraso real do envio ao CNJ (Portaria CNJ 374/2026: envio diário até ~fev/2027) | verificado |
| `nivelSigilo` | number | `nivel_sigilo`; `sigiloso = nivel_sigilo > 0` | verificado; processos sigilosos tendem a nem constar da base pública |
| `orgaoJulgador.codigo` / `.nome` | number / string | `orgao_julgador_codigo`, `orgao_julgador_nome` | verificado |
| `orgaoJulgador.codigoMunicipioIBGE` | number | `codigo_municipio_ibge` → `comarca` via `comarcaPorIbge` (`comarca-por-ibge.ts`) | verificado; mapa IBGE→comarca parcial (ver abaixo) |
| `movimentos[].codigo` / `.nome` | number / string | `movimentos[]` ordenados por data desc; `ultimo_movimento` | verificado |
| `movimentos[].dataHora` | string ISO | `data_hora` (ISO) | verificado; formato compacto a confirmar |
| `movimentos[].complementosTabelados[]` | `{codigo, descricao, valor, nome}` | `complementos: [{codigo, descricao, valor, nome}]` | parcial: estrutura vista em respostas reais; nomes de `descricao` a confirmar |
| `movimentos[].orgaoJulgador` | `{codigoOrgao, nomeOrgao}` | Guardado no `payload_bruto` | a confirmar |
| `id`, `@timestamp` | string | Metadados do índice; guardados no `payload_bruto` | a confirmar |
| partes e advogados | — | **não vêm de forma confiável**; a carteira é completada pela advogada (bootstrap via DJEN) | verificado |

Campos extras passam intactos para `payload_bruto` (schema `looseObject`).

## Consulta

| Item | Implementação | Status |
|---|---|---|
| Corpo | `{ "size": 10, "query": { "match": { "numeroProcesso": "<20 dígitos>" } } }` | verificado (exemplo 3 da wiki) |
| Alias do índice | `api_publica_tjmt` (padrão); outros tribunais via `tribunalAlias` | verificado |
| `size` | 10 a 10.000 (fixamos 10) | verificado |
| `search_after` | Não usado | verificado |
| Resultado | filtra `numero_cnj` exato (o `match` pode trazer vizinhos) e ordena por grau | decisão nossa |

## Limites e erros

| Regra | Implementação | Status |
|---|---|---|
| 120 req/min (termos de uso v1.1) | Janela deslizante de 100/min (`maxRequisicoesPorMinuto`) | verificado |
| 401/403 | `ErroDatajud` com `chaveInvalida = true`, mensagem "chave inválida ou trocada pelo CNJ", sem retentativa; `buscarVarios` aborta | comportamento HTTP a confirmar (pode ser 401 ou 403) |
| 429 | Espera 60 s e repete, até 3 vezes | decisão nossa |
| 5xx / rede | 3 tentativas (1 s, 2 s) | decisão nossa |
| Uso dos dados | só fins legais e internos; não coletar dados pessoais de terceiros; não redistribuir (Portaria CNJ 374/2026) | verificado |

## Códigos TPU usados nos fixtures (`mocks/processo-tjmt.json`)

| Código | Nome | Status |
|---|---|---|
| 26 | Distribuição | conhecido |
| 85 | Petição | conhecido |
| 60 | Expedição de documento | conhecido |
| 51 | Audiência | conhecido |
| 123 | Remessa | conhecido |
| 92 | Publicação | conhecido |
| 7 | Procedimento Comum Cível (classe) | conhecido |
| 7779 / 7780 | Indenização por Dano Material / Moral (assuntos) | a confirmar na TPU |
| complemento 5 `tipo_de_audiencia` = 11 "Instrução e Julgamento"; complemento 2 `tipo_de_distribuicao_redistribuicao` = 1 "Sorteio" | | a confirmar na TPU |

Códigos **não** usados por incerteza: 246 "Definitivo" (baixa), 848 "Arquivamento", 11009 "Juntada de petição", 11010 "Mero expediente" (a confirmar na TPU antes de usar em regras).

## Mapa IBGE → comarca (`comarca-por-ibge.ts`)

- 62 municípios-sede de MT com código conferido (Cuiabá 5103403, Várzea Grande 5108402, Rondonópolis 5107602, Sinop 5107909 etc.).
- **Não incluídos (a confirmar):** São Félix do Araguaia (provável 5107776) e as demais comarcas listadas em `PENDENTES_A_CONFIRMAR`. O mapa é extensível por `registrarComarca` (alimentado por `ref.comarcas`) e `comarcaPorIbge` devolve `null` para código desconhecido; o script `datajud-consulta.ts` imprime "IBGE N (a confirmar)" nesse caso.

## Suposições a confirmar quando a rede liberar

1. Formato das datas (ISO × compacto) em `dataAjuizamento` e `movimentos[].dataHora`.
2. Status HTTP para chave inválida (401 × 403) e corpo da resposta.
3. Estrutura exata de `complementosTabelados` e presença de `movimentos[].orgaoJulgador`.
4. Valores de `grau` além de `G1`/`G2`.
5. Se processos com `nivelSigilo > 0` aparecem na base pública ou são omitidos (a wiki fala em "resguardo").
6. Códigos TPU marcados acima.
