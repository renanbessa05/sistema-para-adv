# ADR 0009: modelo por agente e saída estruturada por etapa

Data: 29/10/2026. Situação: aceita (metas por agente entram no lote 10).

## Contexto
A skill de peças trabalha em seis etapas com parada humana entre elas; a varredura produz um relatório longo e classificado. Cada chamada tem custo e latência diferentes, e os modelos Claude 5.5 têm preços muito distintos (Haiku 0,10/0,50; Sonnet 2/10; Opus 4/20 US$ por milhão de tokens, 28/10/2026).

## Decisão
- O registro em `src/lib/ia/agentes/registro.ts` fixa, por agente, a variável de ambiente do modelo, o esforço (`effort`) e o limite de saída. `executarAgente` aceita `modelo` para sobrescrever num ponto específico: as etapas 1 a 5 e a varredura rodam no `IA_MODELO_PECAS` (Sonnet 5.5, `effort: high`); a redação (etapa 6), o revisor e o julgador no `IA_MODELO_PECAS_FORTE` (Opus 5.5).
- Cada etapa tem schema Zod próprio (`src/lib/ia/schemas/minutas.ts`) com `conteudo_md` (o que a advogada lê) e campos tabulares (o que o sistema usa): uma chamada por etapa, sem laço de ferramentas, com o bloco de sistema em cache e as etapas aprovadas no turno do usuário.
- Documentos do processo entram pela mesma trilha do chat (`anexarParaApi`): PDF inteiro via Files API/base64 dentro dos limites, senão páginas extraídas.
- Lacunas sempre `[[VERIFICAR: …]]`; jurisprudência só com id da base. A validação final é código (`validarPeca`), não o modelo.

## Consequências
Custo previsível por etapa (Sonnet) e só a redação no modelo caro. A comparação cega Sonnet × Opus nas cinco primeiras peças reais e as rubricas por agente (`tests/avaliacao/<agente>/`) ficam para o lote 10 e para a advogada; até lá, `/admin/ia` (lote 10) mostra custo por `objeto_id`.
