# Assistente Jurídica com IA

Sistema interno do escritório (TJ-MT): capta publicações do DJEN, sugere prazos com memória de cálculo, distribui tarefas, acompanha processos pelo DataJud e conversa com a equipe pelo WhatsApp. Nada sai sem aprovação humana.

- Escopo revisado e plano completo: [`docs/escopo-revisado.md`](docs/escopo-revisado.md)
- Regras de negócio que o código implementa: [`docs/regras/`](docs/regras/) (prazos, estados, permissões, glossário, notificações)
- Decisões de arquitetura: [`docs/adr/`](docs/adr/)

## Rodar localmente

```bash
pnpm install
cp .env.example .env.local   # preencha Supabase, Claude e DJEN/DataJud
pnpm dev
```

Banco: Supabase (`supabase start` com Docker, ou um projeto na nuvem com `supabase link` + `supabase db push`). As migrations ficam em `supabase/migrations`.

## Testes

```bash
pnpm test        # unidade + migrations/RLS (precisa de um Postgres: DATABASE_URL_TESTE, padrão postgres://adv_teste:adv_teste@127.0.0.1:5432/postgres)
pnpm test:ci     # com cobertura (motor de prazos exige 100%)
pnpm typecheck
pnpm lint
```

## Scripts úteis

```bash
pnpm djen --oab 12345 --uf MT --dias 30          # consulta o DJEN por OAB
pnpm datajud 00000000000000000000               # consulta um processo no DataJud
pnpm tsx scripts/bootstrap-carteira-djen.ts --oab 12345 --uf MT --dias 180 --saida carteira.csv
pnpm db:migrar --embutido                       # aplica as migrations num banco temporário (smoke test)
```

## Rotinas

Agendadas em `vercel.json` (UTC; Cuiabá = UTC-4) e protegidas por `Authorization: Bearer $CRON_SECRET`. Estado em `/admin/status`.
