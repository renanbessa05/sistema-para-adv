# ADR 0004: dados de referência globais em `ref`, tenant por `escritorio_id` e claims no JWT

Data: 28/10/2026. Situação: aceita.

## Contexto
O documento de concepção diz "toda tabela leva escritorio_id". Aplicado à jurisprudência, feriados, tribunais, comarcas, códigos TPU e preços de IA, isso duplicaria dados que não pertencem a nenhum escritório. Policies de RLS com subconsulta por linha custam caro, e rotinas com service role ignoram RLS.

## Decisão
- Schema `ref` (global, sem `escritorio_id`): `tribunais`, `comarcas`, `feriados`, `tpu_movimentos`, `ia_precos` e, na Fase 2, `jurisprudencia` e `indices_economicos`. Leitura para `authenticated`; escrita só por rotina de ingestão ou ação restrita a sócio e administrativo.
- Schema `public` (tenant): tudo que o escritório produz leva `escritorio_id`, índice iniciado por ele e a policy padrão `escritorio_id = app.escritorio_atual()`.
- Schema `app` (não exposto pela API): funções auxiliares (`escritorio_atual()`, `papel_atual()`, `cnj_valido()` etc.).
- Vínculo usuário ↔ escritório em `escritorio_membros` (fonte da verdade). Um Custom Access Token Hook grava `escritorio_id` e `papel` como claims; as policies leem `auth.jwt()`. Nunca `user_metadata` em policy (o usuário consegue editá-lo). Troca de papel exige refresh do token.
- Ações que dependem de papel e de relação com o objeto (confirmar prazo, aprovar, reatribuir, concluir) são RPCs `security definer` que checam tudo e gravam quem e quando; o UPDATE direto dessas colunas é negado.
- Jobs com service role iteram escritório a escritório e gravam `escritorio_id` explícito. Um teste automatizado com dois escritórios prova que nenhuma linha cruza.

## Consequências
Dados de referência únicos e atualizáveis num só lugar. Policies baratas. Multi-escritório real na Fase 3 só precisa permitir N vínculos por usuário e uma RPC para trocar o escritório ativo.
