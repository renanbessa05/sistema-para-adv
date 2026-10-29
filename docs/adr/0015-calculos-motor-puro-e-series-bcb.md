# ADR 0015: cálculos de atualização com motor puro e séries do BCB

Data: 29/10/2026. Situação: aceita.

## Contexto
O escritório precisa atualizar dívidas (correção e juros) para petições, liquidações e precatórios. Um erro de índice ou de mês vira valor errado em petição. As regras de juros mudaram (EC 113/2021, Lei 14.905/2024) e ainda têm pontos em aberto.

## Decisão
- O motor de cálculo é puro (`src/lib/calculos`), sem Next nem Supabase, com 100% de cobertura exigida. Ele falha quando falta índice em qualquer mês do período, em vez de chutar.
- As séries vêm da API SGS do BCB, gravadas em `ref.indices_economicos` por um job idempotente agendado por pg_cron.
- As regras de juros são presets em `ref.regras_juros`, com `a_confirmar` marcado onde há dúvida. Nenhuma sai em petição sem revisão da advogada.
- O resultado é persistido (itens, memória e totais) e passa pela aprovação humana (objeto `calculo`), como as demais peças.

## Consequências
Convenções (mês seguinte ao inicial, mês comercial de 30 dias, SELIC em soma simples) ficam documentadas em `docs/regras/calculos.md` para conferência. Trocar uma convenção exige mudar o motor e os testes, o que é intencional. O job depende do BCB estar disponível; se falhar, o cálculo novo usa a última série gravada e o erro de índice faltante aparece na tela.
