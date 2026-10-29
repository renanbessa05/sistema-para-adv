# Cálculos de atualização e juros

Motor puro em `src/lib/calculos/atualizar.ts`, com 100% de cobertura exigida no `vitest.config.ts`. Séries do BCB em `src/lib/calculos/bcb.ts`. Persistência e casos de uso em `src/server/calculos.ts`. Telas em `src/app/(painel)/calculos/`.

## Convenções de cálculo (para conferência da advogada)

- **Correção:** fator acumulado com as variações mensais do índice. Começa no mês seguinte ao da data inicial e vai até o mês da data final, inclusive. Mês sem índice publicado é erro: o cálculo não chuta.
- **Juros simples:** taxa mensal × dias ÷ 30 (mês comercial de 30 dias), sobre o valor corrigido.
- **Juros pela SELIC (Fazenda, EC 113/2021):** soma simples das taxas mensais do período, sobre o valor.
- **SELIC menos IPCA (Lei 14.905/2024):** soma simples de cada uma; diferença com piso zero.
- **Arredondamento:** só no resultado final de cada item (centavos, meio para cima).

## Regras de juros (`ref.regras_juros`, migration 0034)

| Código | Uso | Situação |
| --- | --- | --- |
| `civel_pre_14905` | INPC + 1% a.m. desde a citação (cível) | a confirmar |
| `servidor_mt` | INPC + 0,5% a.m. (art. 1º-F da Lei 9.494/1997) | a confirmar frente ao tema vigente |
| `fazenda_ec113` | SELIC acumulada, sem correção em separado | a confirmar aplicação ao caso (Temas 810/STF e 905/STJ) |
| `lei_14905_2024` | IPCA + SELIC menos IPCA | a confirmar incidência e período de transição |
| `contratual_personalizada` | Correção e taxa informadas pela advogada | exige taxa no cálculo |

Nenhuma regra marcada "a confirmar" deve sair em petição sem revisão da advogada. A tela mostra o aviso na página do cálculo.

## Séries do BCB (job `importar-indices`)

- Códigos SGS: INPC 188, IPCA 433, IPCA-E 10764, IGP-M 189, SELIC 4390 (conferir antes do primeiro uso real).
- Rotina `/api/jobs/importar-indices`, agendada por pg_cron na migration 0035 (segundas, 09:00 UTC). Baixa desde 01/01/2015 e grava com `upsert` em `ref.indices_economicos`: é idempotente.
- Base da API configurável por `BCB_SGS_BASE_URL` (padrão `https://api.bcb.gov.br/dados/serie/bcdata.sgs`).

## Fluxo e aprovação

1. Advogado ou sócio informa itens (descrição, data inicial, valor), regra e data final.
2. `criarECalcular` calcula com o motor e grava `calculos`, `calculo_itens`, memória de cálculo e totais.
3. Enviar para aprovação chama a RPC `calculo_enviar_aprovacao`, que cria a aprovação do objeto `calculo`. Sem resultado, não envia.
4. A decisão aplica o efeito em `app.efeito_aprovacao_calculo`: aprovada → `aprovado`; rejeitada ou ajustada → `rejeitado`, com a aprovação desligada.
5. Status não muda por update direto: a policy restritiva `calculos_status_so_rpc` só aceita `rascunho` ou `rejeitado` do usuário; o resto passa pela RPC.

## Sigilo e acesso

RLS por escritório e policy restritiva de sigilo (`app.pode_ver_sigiloso`) quando há processo vinculado. MFA obrigatório para advogado e sócio, como nas demais tabelas.

## Pendências deste lote

- Memória de cálculo em PDF (pdf-lib): não implementada. Hoje a memória aparece na tela, em `<details>`.
- Validação com 10 cálculos reais da advogada (ver `docs/proximos-passos.md`).
- Confirmar os códigos SGS e os presets "a confirmar" com a Bruna.
- Teste de banco `supabase/tests/calculos.test.ts` escrito, mas só roda com Postgres local ou no CI.
