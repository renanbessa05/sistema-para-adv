# DJEN (Comunica PJe): campos, uso e status de verificação

Fonte da API: `GET https://comunicaapi.pje.jus.br/api/v1/comunicacao` (Swagger v1.0.4). Código em `src/lib/djen`. Fatos e fontes em `docs/escopo-revisado.md`, Apêndice A.1.

**Status:** "verificado" = consta do Swagger ou de respostas reais publicadas por clientes independentes; "a confirmar" = suposição a checar quando a rede liberar `comunicaapi.pje.jus.br`. Nesta sessão a API não pôde ser chamada; os fixtures em `src/lib/djen/mocks/` foram construídos a partir dos campos verificados.

## Envelope da resposta

| Campo | Tipo | Como usamos | Status |
|---|---|---|---|
| `status` | string (`"success"`) | Ignorado; o sucesso vem do HTTP 200 | verificado |
| `message` | string | Só para log | verificado |
| `count` | number | Total de itens da consulta; dirige a paginação em `consultarTodas` | verificado |
| `items[]` | ItemDjen[] | Cada item vira uma `PublicacaoNormalizada` | verificado |

## Item (`items[]`)

| Campo | Tipo | Como usamos (`PublicacaoNormalizada`) | Status |
|---|---|---|---|
| `id` | number | `id_externo = String(id)`: chave primária de deduplicação (`publicacoes (fonte, id_externo)` único) | verificado |
| `hash` | string | `hash_djen`; monta a URL da certidão `GET /api/v1/comunicacao/{hash}/certidao` (PDF, prova da intimação) | verificado |
| `data_disponibilizacao` | string `YYYY-MM-DD` | `data_disponibilizacao`; base do cálculo de publicação (1º dia útil seguinte) e início da contagem (motor de prazos) | verificado |
| `datadisponibilizacao` | string `DD/MM/YYYY` | Fallback quando a ISO não vem | verificado |
| `siglaTribunal` | string (`"TJMT"`) | `tribunal_sigla`; filtro da consulta | verificado |
| `tipoComunicacao` | string (`"Intimação"`, `"Citação"`, `"Edital"`…) | `tipo_origem`; entrada do classificador | verificado; lista completa de valores a confirmar |
| `tipoDocumento` | string (`"Despacho"`, `"Decisão"`, `"Sentença"`…) | `tipo_documento`; entrada do classificador | verificado; lista completa a confirmar |
| `nomeOrgao` | string | `orgao`; sugere a comarca na carteira | verificado |
| `idOrgao` | number | Guardado no `payload_bruto`; corresponde ao parâmetro `orgaoId` do Swagger | verificado |
| `texto` | string HTML | `texto_html` (original) e `texto` (texto simples: sem tags, entidades decodificadas, espaços normalizados). Só o texto simples vai ao modelo, como dado delimitado | verificado |
| `numero_processo` | string, 20 dígitos | `numero_cnj` (fallback) | verificado |
| `numeroprocessocommascara` | string `NNNNNNN-DD.AAAA.J.TR.OOOO` | `numero_processo_texto`; `numero_cnj` extraído (20 dígitos); null se não houver 20 dígitos | verificado |
| `meio` | `"D"` diário / `"E"` edital | `meio`; editais seguem fluxo próprio (prazo conta do fim do edital) | verificado |
| `meiocompleto` | string | Só exibição | verificado |
| `link` | string ou null | `link` (abre o documento no PJe do tribunal) | verificado |
| `nomeClasse` / `codigoClasse` | string / string ou number | `classe_nome`, `classe_codigo` (sempre string). Código TPU de classe | verificado; tipo de `codigoClasse` (string × number) a confirmar |
| `numeroComunicacao` | number | `numero_comunicacao` (referência humana) | verificado |
| `ativo` | boolean | `ativo`; `false` ⇒ `cancelada` | verificado |
| `status` | string (`"P"`) | `status`; `"C"` tratado como cancelada | `"P"` verificado; demais valores e o significado de `"C"` a confirmar |
| `motivo_cancelamento` | string ou null | `motivo_cancelamento`; presença ⇒ `cancelada` | verificado |
| `data_cancelamento` | string ou null | `data_cancelamento`; presença ⇒ `cancelada` | verificado |
| `destinatarios[]` | `{nome, polo, comunicacao_id}` | `destinatarios: [{nome, polo}]`; alimenta `partes_vistas` no bootstrap da carteira | verificado; valores de `polo` (`"A"`/`"P"`) a confirmar |
| `destinatarioadvogados[]` | `{id, comunicacao_id, advogado: {id, nome, numero_oab, uf_oab}}` | `destinatario_advogados: [{nome, numero_oab, uf_oab}]`; confere se a OAB do escritório está na publicação (risco medido no teste de captação) | verificado |

Campos extras passam intactos para `payload_bruto` (schema `looseObject`).

## Campos derivados (não vêm da API)

| Campo | Regra | Observação |
|---|---|---|
| `cancelada` | `ativo === false` ou `status === "C"` ou `motivo_cancelamento`/`data_cancelamento` presentes | `"C"` a confirmar |
| `hashDedup` | sha256(`tribunal|numero_cnj ?? numero_processo_texto|data_disponibilizacao|texto normalizado`) | Segunda rede de deduplicação (republicação com `id` novo). Não usa `hash` da API, que muda a cada republicação |
| data de publicação / início do prazo | **não vêm da API**; calculadas pelo motor de prazos (Lei 11.419 art. 4º §§3º e 4º; CPC 224 §§2º e 3º) | fora deste módulo |

## Parâmetros de consulta

| Parâmetro | Uso | Status |
|---|---|---|
| `numeroOab` + `ufOab` | Captação diária por advogado | verificado |
| `siglaTribunal` | Restringir ao TJMT | verificado |
| `dataDisponibilizacaoInicio/Fim` (`YYYY-MM-DD`) | Janela da captação; 180 dias no bootstrap | verificado |
| `numeroProcesso` | Consulta pontual; enviado com 20 dígitos | verificado; aceitar com máscara a confirmar |
| `nomeAdvogado`, `nomeParte`, `texto`, `meio` | Disponíveis no cliente, sem uso no MVP | verificado |
| `itensPorPagina` | 5 ou 100 (padrão 100) | verificado; relato de 1000 não adotado |
| `pagina` | Paginação a partir de 1 | verificado |
| `orgaoId`, `numeroComunicacao` | Não expostos no cliente (sem uso previsto) | verificado no Swagger |
| ao menos um filtro obrigatório entre `siglaTribunal`, `texto`, `nomeParte`, `nomeAdvogado`, `numeroOab`, `numeroProcesso` | Validado no cliente antes de chamar a rede | verificado |

## Limites e comportamento do cliente

| Regra | Implementação | Status |
|---|---|---|
| ~20 req/min por IP; cabeçalhos `x-ratelimit-limit`/`x-ratelimit-remaining` | Janela deslizante de 18/min; cabeçalhos expostos em `ultimoRateLimit` | limite medido é "parcial"; nomes exatos dos cabeçalhos a confirmar |
| 429 → esperar 1 min | Espera 60 s e repete, até 3 vezes | verificado (Swagger) |
| 5xx / falha de rede | 3 tentativas (1 s, 2 s) e `ErroDjen` com status e corpo | decisão nossa |
| Teto de 10.000 resultados por consulta | `consultarTodas` não ultrapassa 10.000 e marca `truncado` | verificado |
| Sem autenticação | Nenhum header de chave | verificado |
| `GET /api/v1/comunicacao/tribunal` | `tribunais()`; aceita lista direta ou `{items}` | endpoint verificado; formato do corpo a confirmar |
| `GET /api/v1/caderno/{sigla}/{data}/{meio}` | Não implementado (zip do caderno; não é necessário no MVP) | verificado no Swagger |

## Suposições a confirmar quando a rede liberar

1. Tipo de `codigoClasse` (string ou number) e de `numero_oab` (string ou number): o schema aceita ambos e converte para string.
2. Valores possíveis de `status` (além de `"P"`) e se `"C"` marca cancelamento; valores de `destinatarios[].polo`.
3. Nome exato dos cabeçalhos de rate limit e se existe `x-ratelimit-reset`.
4. Formato da resposta de `/api/v1/comunicacao/tribunal`.
5. Formato de `hash` (os fixtures usam 64 hex).
6. Se `numeroProcesso` aceita número com máscara.
