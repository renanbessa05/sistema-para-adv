# ADR 0003: rotinas em Vercel Cron com rotas do app e fila no Postgres

Data: 28/10/2026. Situação: aceita.

## Contexto
A captação do DJEN é leve, mas o enriquecimento de centenas de processos pelo DataJud e a classificação por IA levam minutos. As Edge Functions do Supabase têm 150 s (Free) ou 400 s (pagos) de tempo total e 2 s de CPU. As funções da Vercel no plano Pro vão a 300 s por padrão e 800 s no máximo, e o Cron do Pro dispara até uma vez por minuto.

## Decisão
`vercel.json` agenda rotas `/api/jobs/<nome>` protegidas por `Authorization: Bearer <CRON_SECRET>`. Cada rota processa um lote pequeno e termina. Trabalho que não cabe numa execução vai para filas no Postgres (`pgmq` quando disponível; tabela de fila própria como alternativa), drenadas a cada 5 minutos. Cada rodada registra início, fim, itens e erros em `captacoes` ou `jobs_execucoes`; toda rotina é idempotente. Horários escritos em UTC com deslocamento fixo de 4 h (Cuiabá não tem horário de verão).

## Adendo de 29/10/2026: agendador no Postgres
O plano Hobby da Vercel recusa cron com mais de uma execução por dia, e o Pro ficou para depois. O agendamento saiu de `vercel.json` e foi para o banco (migration `20261029000023`): `pg_cron` dispara, nos mesmos horários UTC, `app.chamar_rotina(<nome>)`, que faz GET em `/api/jobs/<nome>` pelo `pg_net` com o Bearer lido do Vault (`app:url`, `app:cron_secret`). Rotas, jobs, fila e registro em `jobs_execucoes` não mudaram. Trocar de volta para o Vercel Cron é devolver os `crons` ao `vercel.json` e desagendar com `cron.unschedule`. Alternativa descartada: GitHub Actions (cobra 1 minuto por execução e atrasa vários minutos).

## Consequências
Uma tecnologia a menos (sem worker separado nem Edge Functions). Limites externos respeitados por ritmo: ~20 requisições por minuto no DJEN e 120 no DataJud. Se um job passar de 800 s, migra para um worker separado sem mudar o restante.
