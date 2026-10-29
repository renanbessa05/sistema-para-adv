# ADR 0019: avaliação de agentes por rubrica, custo por agente e alerta de teto

Status: aceito (lote 10).

## Contexto

O escopo pede medir os agentes sem depender de olhar cada saída, acompanhar o custo por agente e avisar os sócios antes do teto de IA bloquear o escritório. Havia dois agentes com prompt e schema prontos (`outros_tribunais` e `julgador`) e um registro de juiz (`juiz_avaliacao`) sem prompt.

## Decisão

- Casos em `tests/avaliacao/<agente>/casos.json`, com rubricas puras (`contem`, `nao_contem`, `regex`, `schema`, `juiz`) em `src/lib/ia/avaliacao`. O modo falso roda no CI; o modo real é manual e não entra no CI.
- Casos de controle negativo (`esperado: reprovado`) provam que a rubrica pega o erro.
- Juiz de avaliação com prompt versionado (`juiz-avaliacao.v1`) e veredito estruturado. O texto do agente entra delimitado como dado.
- `ia_avaliacoes` guarda as rodadas gravadas pela service role; a tela `/admin/ia` lê só para sócio.
- `ia_custos_do_escritorio` agrupa o custo do mês por agente, com taxa de cache, e respeita o RLS.
- Rotina `alertas-ia` (12h UTC) avisa os sócios com o evento `ia_teto_proximo` ao atingir `ia.alerta_percentual` (padrão 80%), uma vez por mês.
- Os wrappers `public.ia_gasto_mes` e `public.ia_teto_escritorio` corrigem a chamada do teto, que apontava para funções que a API não expunha.

## Consequências

- A avaliação real não passa pela porta única: não grava `ia_execucoes` e não conta no teto. Aceito por enquanto; registrado como pendência em `docs/regras/avaliacao-ia.md`.
- A qualidade jurídica continua dependendo da revisão da advogada. A avaliação mede aderência a regras de forma, não acerto da tese.
- Migrations 0041 a 0043 não foram validadas num Postgres local neste lote; o teste de banco `supabase/tests/ia-avaliacoes.test.ts` foi escrito e não foi executado.
