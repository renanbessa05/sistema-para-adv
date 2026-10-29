# Avaliação de agentes, custo por agente e alerta de teto (lote 10)

## Avaliação

Cada agente avaliável tem uma pasta `tests/avaliacao/<agente>/casos.json` (formato em `src/lib/ia/avaliacao/casos.ts`). Um caso traz a entrada, a saída esperada em modo falso (`saidaFalsa`, com `juizFalso` quando houver rubrica de juiz) e as rubricas:

- `contem` / `nao_contem`: texto presente ou ausente (sem diferenciar caixa nem acento);
- `regex`: padrão que deve (ou não deve) casar; ex.: o resíduo de TJ-MT, o segmento `8.11` e `Cuiabá` não podem aparecer num processo de outro tribunal;
- `schema`: a saída passa no schema Zod do agente;
- `juiz`: um modelo (`juiz_avaliacao`, prompt `juiz-avaliacao.v1`) confere um critério em português; a saída entra delimitada como dado.

Casos com `"esperado": "reprovado"` são controles negativos: provam que a rubrica pega o erro. Um caso "bate" quando o resultado é igual ao esperado.

Agentes hoje com casos: `outros_tribunais` e `julgador`. Para acrescentar um: prompt, schema e entrada em `src/lib/ia/avaliacao/agentes.ts`, e a pasta com `casos.json`.

### Modos

- **Falso (CI, sem API):** `tests/avaliacao/casos.test.ts` roda em `pnpm test`. Valida casos e rubricas; não mede o modelo.
- **Real (manual):** `pnpm avaliar:agente --agente julgador --real` (ou o workflow `.github/workflows/avaliacao.yml`, só por `workflow_dispatch`). Exige `ANTHROPIC_API_KEY` e `IA_TESTE_REAL=1`. Sem `--gravar`, nada vai ao banco.
- **Gravar:** `--gravar --escritorio <uuid>` insere uma linha em `ia_avaliacoes` com a service role (`NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`). Aparece em `/admin/ia`.

Limite: a avaliação real não passa pela porta única `executarAgente`, então não cria linhas em `ia_execucoes` e não conta no teto. `custo_usd` fica em zero. Confira o gasto real no painel do provedor antes de rodar lotes grandes. (a confirmar: se a avaliação deve passar a contar no teto.)

### Pendências da avaliação

- Rubricas de qualidade jurídica (concordância da advogada com a previsão do julgador, qualidade da análise de outros tribunais) dependem da revisão humana. Não estão automatizadas.
- Casos de `juiz` no modo real ainda não foram rodados. Nenhuma avaliação real foi feita neste lote.
- Os casos usam processos fictícios. Nenhum dado real de cliente entra em `tests/`.

## Custo e teto

- `public.ia_custos_do_escritorio(p_escritorio, p_data)`: por agente, no mês UTC, chamadas, erros, tokens, custo e taxa de cache (`cache_leitura / total de entrada`). Respeita o RLS de `ia_execucoes` (só sócio).
- Tela `/admin/ia` (só sócio): gasto do mês, teto, uso do teto, custo por agente e últimas avaliações.
- Chaves em `escritorio_configuracoes`:
  - `ia.teto_mensal_usd`: número em US$. Sem linha, vale `IA_TETO_MENSAL_USD` do ambiente (padrão 50). Ajuste por SQL ou pela tela de configurações, quando houver (a confirmar).
  - `ia.alerta_percentual`: de 1 a 100. Sem linha, vale 80. Valor inválido também cai em 80.
- Correção incluída na migration 0041: `src/server/ia/teto.ts` chamava `admin.rpc("ia_gasto_mes")` e `ia_teto_escritorio`, mas as funções ficavam no schema `app`, que a API não expõe (`supabase/config.toml` lista só `public`, `ref`, `graphql_public`). O erro voltava sem ser lido e o teto nunca bloqueava. Os wrappers em `public`, só para service role, resolvem isso. Confirme no Supabase que a chamada do teto passou a retornar valor antes de considerar o teto ativo.

## Alerta

- Rotina `alertas-ia`, todo dia às 12h UTC (08h em Cuiabá), agendada por `cron.schedule` na migration 0043 (padrão de 0023).
- Quando o gasto do mês chega a `ia.alerta_percentual` do teto, enfileira o evento `ia_teto_proximo` para os sócios (painel e e-mail). Uma vez por escritório por mês: antes de avisar, procura o aviso do mês em `notificacoes`.
- Não bloqueia nada. O bloqueio a 100% é do teto (`cancelado_teto`), na porta única.
- O evento está em migration própria (0042), porque o valor novo do enum não pode ser usado na mesma transação.
- A rota `/api/jobs/alertas-ia` só responde depois do deploy. Antes disso, o pg_cron chama uma URL que ainda não existe; a chamada falha sem efeito no banco.

## Migrations deste lote

- `20261029000041_ia_avaliacoes.sql`: tabela `ia_avaliacoes` (RLS por `escritorio_id`, leitura só sócio, laço MFA), funções de custo e wrappers do teto.
- `20261029000042_ia_teto_proximo_enum.sql`: valor `ia_teto_proximo`.
- `20261029000043_alertas_ia_cron.sql`: rotina `alertas-ia`.
