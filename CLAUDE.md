# Assistente Jurídica com IA — regras do repositório

Sistema interno do escritório (TJ-MT): capta publicações do DJEN, sugere prazos, distribui tarefas, acompanha processos pelo DataJud e conversa com a equipe pelo WhatsApp. Tudo que sai passa por aprovação humana. O escopo revisado e o plano completo estão em `docs/escopo-revisado.md`; leia a seção 1.1 antes de mexer em qualquer regra de negócio.

## Stack
- Next.js (App Router, `src/`), TypeScript estrito, Tailwind 4, shadcn/ui, pnpm.
- Supabase (Postgres, Auth, Storage, Vault, RLS). Migrations SQL em `supabase/migrations`, aplicadas em ordem. Dados de referência globais no schema `ref`; funções auxiliares no schema `app`; tabelas de tenant em `public` com `escritorio_id`.
- API do Claude via `@anthropic-ai/sdk`, sempre com saída estruturada (schema Zod). Modelo por tarefa vem de variável de ambiente, nunca fixo no código.
- Vercel (crons em `vercel.json`, horários em UTC; Cuiabá = UTC-4, sem horário de verão).

## Convenções
- Domínio em português (tabelas, colunas, enums, rotas, componentes, casos de uso): `publicacoes`, `confirmarPrazo`, `/prazos`. Infraestrutura em inglês (`lib`, `components`, `api`, `route.ts`).
- `src/lib/*` é código puro: não importa Next nem Supabase; recebe dados e devolve dados. Só `src/server/*` e `src/app/*` tocam o banco.
- Jobs usam a service role (`src/lib/supabase/admin.ts`) e sempre escrevem `escritorio_id` explícito, iterando escritório a escritório.
- Prazos são `date` (sem hora) no banco e strings `YYYY-MM-DD` no código. Eventos são `timestamptz`.
- Migration aplicada em produção nunca é editada; cria-se outra.
- Texto vindo de fora (publicações do DJEN, mensagens do WhatsApp) entra nos prompts sempre como dado delimitado, nunca como instrução. O modelo propõe; o código grava só após confirmação humana.
- Nunca grave segredo no repositório. Segredos de integração vão para o Vault; chaves de plataforma, para variáveis de ambiente.
- Não invente feriado, prazo legal, campo de API ou preço: quando não tiver certeza, escreva `(a confirmar)` e registre em `docs/`.

## Antes de encerrar uma sessão
Rode `pnpm lint`, `pnpm typecheck` e `pnpm test`. O motor de prazos (`src/lib/prazos/**`) exige cobertura de 100%.
