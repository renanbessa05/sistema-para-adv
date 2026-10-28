# ADR 0003: rotinas em Vercel Cron com rotas do app e fila no Postgres

Data: 28/10/2026. Situação: aceita.

## Contexto
A captação do DJEN é leve, mas o enriquecimento de centenas de processos pelo DataJud e a classificação por IA levam minutos. As Edge Functions do Supabase têm 150 s (Free) ou 400 s (pagos) de tempo total e 2 s de CPU. As funções da Vercel no plano Pro vão a 300 s por padrão e 800 s no máximo, e o Cron do Pro dispara até uma vez por minuto.

## Decisão
`vercel.json` agenda rotas `/api/jobs/<nome>` protegidas por `Authorization: Bearer <CRON_SECRET>`. Cada rota processa um lote pequeno e termina. Trabalho que não cabe numa execução vai para filas no Postgres (`pgmq` quando disponível; tabela de fila própria como alternativa), drenadas a cada 5 minutos. Cada rodada registra início, fim, itens e erros em `captacoes` ou `jobs_execucoes`; toda rotina é idempotente. Horários escritos em UTC com deslocamento fixo de 4 h (Cuiabá não tem horário de verão).

## Consequências
Uma tecnologia a menos (sem worker separado nem Edge Functions). Limites externos respeitados por ritmo: ~20 requisições por minuto no DJEN e 120 no DataJud. Se um job passar de 800 s, migra para um worker separado sem mudar o restante.
