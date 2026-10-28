# Próximos passos (estado em 28/10/2026)

Resumo de onde o sistema está, o que só o escritório pode fazer e o que ainda falta da Fase 1. O plano completo está em `docs/escopo-revisado.md`; a implantação, em `docs/deploy.md`.

## 1. O que já existe (branch `claude/confident-darwin-5z65s7`)

| Área | Estado | Onde |
|---|---|---|
| Banco (15 migrations, RLS, papéis, RPCs) | Pronto; testado num Postgres real no CI | `supabase/migrations`, `supabase/tests` |
| Motor de prazos (TJ-MT, CPC, recesso, dobro, feriados por comarca) | Pronto; 100% de cobertura; 11 casos de referência | `src/lib/prazos`, `tests/fixtures/prazos-casos.json`, `docs/regras/prazos.md` |
| Captação DJEN + dedup + classificação por IA + sugestão de prazo | Pronto; roda pelos crons de `vercel.json` | `src/server/jobs/captar-djen.ts`, `classificar.ts`, `src/lib/djen`, `src/lib/ia` |
| Enriquecimento pelo DataJud | Pronto | `src/server/jobs/enriquecer-datajud.ts`, `src/lib/datajud` |
| Telas: Hoje, Publicações, Prazos, Tarefas, Processos (lista, detalhe, kanban, importação CSV), Clientes, Aprovações, Configurações (escritório, equipe, atos, fases, calendário, ausências, notificações), Rotinas, Métricas, Notificações | Pronto | `src/app/(painel)` |
| Notificações (painel, e-mail via Resend, WhatsApp por template), alertas D-3/D-1/D0, 24 h/48 h sem tratamento, resumo do dia, vigilante da captação, exportação diária de prazos | Pronto | `src/server/notificacoes.ts`, `src/server/jobs/*` |
| WhatsApp: webhook assinado, intents de leitura e de escrita com eco + "Confirma?", verificação de telefone | Pronto (templates ainda não submetidos à Meta) | `src/server/whatsapp.ts`, `src/lib/whatsapp` |
| Operação: `/admin/status`, `/admin/metricas`, `/api/health`, runbooks, LGPD | Pronto | `docs/runbooks`, `docs/lgpd` |
| CI (lint, typecheck, testes unitários e de banco, build, fumaça Playwright) | Verde | `.github/workflows/ci.yml` |

## 2. O que só o escritório pode fazer (nesta ordem)

1. **Contas e chaves** (passo a passo em `docs/deploy.md`): Supabase dev e prod em São Paulo, Vercel Pro, Resend com domínio verificado, chave da API do Claude com limite de gasto, chave pública do DataJud (wiki do CNJ). Depois: Meta Business verificada, número novo de WhatsApp, templates submetidos.
2. **Primeiro escritório e primeira sócia** no banco (SQL em `docs/deploy.md`, seção 2). Os demais entram por convite em Configurações → Equipe.
3. **Insumos da equipe**: nome completo, OAB/UF com sufixo, nomes alternativos e telefone de cada advogado; papel de cada membro (sócio, advogado, estagiário, administrativo).
4. **Carteira**: planilha CSV com número CNJ, cliente (nome, CPF/CNPJ, telefone), polo, parte contrária, comarca, responsável, sigiloso. O script `pnpm tsx scripts/bootstrap-carteira-djen.ts --oab <n> --uf MT --dias 180` gera o rascunho a partir do DJEN; a tela Processos → Importar carrega.
5. **30 intimações reais já contadas** (data de disponibilização, ato, prazo, data final) para completar `tests/fixtures/prazos-casos.json`. Hoje há 11 casos construídos a partir da lei e do calendário; os casos reais são a prova final do motor.
6. **Calendário forense**: conferir a Portaria TJMT/PRES 1915/2025 contra `supabase/migrations/20261028000003_ref_dados.sql` (feriados 2026 e municipais das comarcas da carteira) e cadastrar as portarias de alteração de 2026 em Configurações → Calendário. Quando sair a Portaria de 2027, importar antes do recesso (`docs/runbooks/calendario-forense-anual.md`).
7. **Teste de captação de 10 dias úteis** (`docs/fase0/teste-de-captacao.md`): o administrativo registra as intimações vistas no PJe e nos e-mails; `scripts/teste-captacao-cruzar.ts` cruza com o banco.
8. **Rótulo do classificador**: 15 minutos por dia marcando acerto do tipo de ato na tela de Publicações; `scripts/exportar-classificacoes.ts` gera a fixture de regressão.
9. **LGPD**: nomear o encarregado, aprovar `docs/lgpd/*`, pedir à Anthropic a incorporação das cláusulas-padrão da ANPD, incluir a cláusula de uso de IA no contrato de honorários.
10. **Rede do ambiente do Claude Code**: liberar os domínios listados em `docs/deploy.md`, seção 7, para que as próximas sessões consigam testar DJEN, DataJud e Meta daqui.

## 3. O que ainda falta da Fase 1 (próximas sessões)

- MFA TOTP obrigatório para sócio e advogado (policy restritiva com `aal2`) e tela de cadastro do autenticador.
- Mover `WHATSAPP_ACCESS_TOKEN` e `DATAJUD_API_KEY` para o Vault (`app.segredo` já existe; falta o fluxo de gravação e a leitura nos jobs).
- Tela `/admin/divergencias` para a operação paralela (`docs/runbooks/operacao-paralela.md`).
- Regras de notificação para os eventos `publicacao_sem_processo` e `prazo_vencido` (existem no enum, não em `REGRAS`).
- Convite para e-mail que já tem usuário no Auth (hoje só o fluxo de usuário novo).
- Suspender/prorrogar prazo a partir de `suspenso`/`prorrogado` (hoje só a partir de `confirmado`).
- Competência de Juizado deduzida do órgão julgador do DataJud, sem sugerir data (decisão 1.4.10 do escopo).
- Contratos e honorários (T1.37, condicional) com gerador de `.docx`.
- Playwright além da fumaça: tratar publicação, confirmar prazo, concluir tarefa, com Supabase local no CI.

## 4. Como rodar localmente

```bash
pnpm install
cp .env.example .env.local   # preencher
pnpm dev
```

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Os testes de banco precisam de um Postgres 16 em `postgres://adv_teste:adv_teste@127.0.0.1:5432/postgres` (ou `DATABASE_URL_TESTE`).
