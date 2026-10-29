# ADR 0008: julgador neutro e análise de outros tribunais com camada local

Status: aceito (lote 9).

## Contexto

O escopo pede duas análises de apoio à advogada que não são peça de parte: o mapa de como o juízo leria o processo (skill tjmt-skill-cl, TJ-MT) e a análise de processos de outros TJs estaduais, onde regras de sistema, custas e comunicação mudam de estado para estado (skill analise-processual-todos-tribunais).

## Decisão

- O julgador é um agente separado, restrito ao TJ-MT, com prompt versionado (`julgador.v1`) e saída estruturada. Usa o modelo forte (`IA_MODELO_PECAS_FORTE`) com esforço alto.
- O aviso de previsão judicial é imposto pelo código, não só pedido ao modelo.
- A camada local de outros tribunais vem do banco (`ref.tribunal_camada_local` e `escritorio_camada_local`). Itens sem fonte são "a verificar" e o modelo não os confirma de memória.
- Nenhuma migration nova para o julgador: a tabela `analises` (migration 0031) e o enum `mapa_julgador` já existiam.

## Consequências

- Não há avaliação automática por rubrica ainda; ela entra no lote 10 com `tests/avaliacao/julgador/casos.json`.
- A qualidade do mapa depende de revisão humana da advogada; o produto sempre sai rotulado como previsão.
- Modo B (sem pesquisa web) significa que nenhuma jurisprudência é citada com número nesta versão.
