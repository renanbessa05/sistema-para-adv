# Próximos passos (estado em 29/10/2026)

Resumo de onde o sistema está, o que só o escritório pode fazer e o que ainda falta da Fase 1. O plano completo está em `docs/escopo-revisado.md`; a implantação, em `docs/deploy.md`.

## 1. O que já existe (branch `claude/confident-darwin-5z65s7`)

| Área | Estado | Onde |
|---|---|---|
| Banco (21 migrations, RLS, papéis, RPCs, MFA por policy, Vault) | Pronto; testado num Postgres real no CI | `supabase/migrations`, `supabase/tests` |
| Motor de prazos (TJ-MT, CPC, recesso, dobro, feriados por comarca) | Pronto; 100% de cobertura; 11 casos de referência | `src/lib/prazos`, `tests/fixtures/prazos-casos.json`, `docs/regras/prazos.md` |
| Captação DJEN + dedup + classificação por IA + sugestão de prazo | Pronto; roda pelos crons de `vercel.json` | `src/server/jobs/captar-djen.ts`, `classificar.ts`, `src/lib/djen`, `src/lib/ia` |
| Enriquecimento pelo DataJud | Pronto | `src/server/jobs/enriquecer-datajud.ts`, `src/lib/datajud` |
| Telas: Hoje, Publicações, Prazos, Tarefas, Processos (lista, detalhe, kanban, importação CSV), Clientes, Aprovações, Configurações (escritório, equipe, atos, fases, calendário, ausências, notificações, integrações, segurança), Rotinas, Divergências, Métricas, Notificações, MFA (`/mfa`, `/mfa/cadastro`) | Pronto | `src/app/(painel)`, `src/app/(auth)/mfa` |
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

## 3. Feito em 29/10/2026 (antes só previsto)

- MFA TOTP obrigatório para sócio e advogado: policy restritiva com `aal2` nas tabelas sensíveis e checagem nas RPCs; telas `/mfa` e `/mfa/cadastro`; Configurações → Segurança. Exige habilitar TOTP em Authentication → Multi-Factor no painel do Supabase.
- Segredos do WhatsApp e do DataJud no Vault, por escritório, pela tela Configurações → Integrações; variável de ambiente segue como fallback.
- Tela `/admin/divergencias` da operação paralela, com contagem de semanas limpas (meta 4).
- Eventos `publicacao_sem_processo` e `prazo_vencido` nas regras de notificação e emitidos pelos jobs.
- Convite para e-mail que já tem usuário no Auth (vínculo + link de acesso por e-mail).
- Suspender/prorrogar a partir de `suspenso`/`prorrogado` e `retomar_prazo`.
- Competência (vara comum, juizado, 2º grau) deduzida do DataJud; juizado exige conferência manual do prazo.

## 3a. Feito em 29/10/2026 à noite (sessão local)

- `.env.local` montado e validado contra Supabase, Claude, DataJud e Resend; `.env.example` passou a ser versionado.
- Supabase `qcikrqyzrtgfhtlfbabi` configurado pela CLI (`supabase config push`): schema `ref` exposto na API, sign-ups desligados, hook de claims ativo, URLs do Auth apontando para `sistema-para-adv.vercel.app`. `app.mfa_satisfeita()` e Vault validados no banco real (pendência 1 da seção 4 fechada).
- Projeto `sistema-para-adv` criado na Vercel, ligado ao GitHub, com as variáveis de produção.
- Rotinas agendadas pelo Postgres (`pg_cron` + `pg_net`, migration 0023) porque o plano Hobby da Vercel recusa crons frequentes; ADR 0003 tem o adendo. Pendente: decidir sobre o plano Pro (uso comercial pelos termos da Vercel).
- Região do Supabase é `us-west-2`, não São Paulo como o plano previa: decidir antes de carregar dados de clientes.

## 3b. Fases 2 e 3 em construção (plano aprovado em 29/10/2026)

O Renan decidiu construir as Fases 2 e 3 inteiras agora e testar depois com a Bruna. Plano em 15 lotes (L1 a L15); cada lote fecha com lint, tipos, testes, migration aplicada e deploy. Referência funcional: `docs/referencias/poly-ai-video.md`. Regras dos agentes: `docs/regras/agentes.md`.

| Lote | Entrega | Estado |
|---|---|---|
| L1 | Fundação de IA (cliente com ferramentas, multi-turno, PDF, cliente falso com roteiro), teto mensal em toda chamada (`executarAgente`), `decidir_aprovacao` com efeitos por objeto, `documentos` + Storage + extração de texto (rotina `extrair-texto`), bloco Documentos em processo e cliente | Feito (migrations 0024 a 0026; ADRs 0006 e 0010) |
| L2 | Chat `/assistente`: conversas no painel (migration 0027), roteador v1, assistente com 9 ferramentas de leitura sob RLS, escrita com eco e confirmação, streaming por SSE, Markdown no painel, atalho na tela do processo | Feito (ADR 0012) |
| L3 | Contratos e honorários: Tabela OAB/MT em `ref` (113 rubricas, URH 1.339,07; migration 0028 gerada de `src/lib/honorarios/tabela-oab-mt.ts`), diagnóstico pela IA (`honorarios.v1`), cálculo em três camadas e matriz de modalidade em código (100% coberto), confirmação da advogada, contrato/procuração/declaração em `.docx` com timbre genérico, aprovação com efeito, assinatura gera parcelas, rotina `cobranca-parcelas` e evento `parcela_vencida`; telas `/contratos`, Configurações → Honorários e → Documentos | Feito (ADR 0011; `docs/regras/honorarios.md`) |
| L4 | Peças: minutas em 6 etapas com aprovação por etapa (migration 0031), agente `peticao.v1` com referências por área, varredura dos autos (`varredura.v1`, pontos por eixo aprovados pela advogada → minuta), validação determinística da peça (`validarPeca`), versões em Markdown + .docx, aprovação com efeito (ajustada vira nova versão), protocolo; telas `/minutas`, `/varreduras`, Configurações → Modelos | Feito (ADR 0009; `docs/regras/minutas.md`) |
| L5 | Revisor de peças (checklist formal, Crítico bloqueia aprovação) | Próximo |
| L6 a L15 | Cálculos, jurisprudência, Google, julgador, avaliação, relatórios, LGPD, multi-escritório, atendimento ao cliente, operação | Pendentes |

Pendências do L1 que só se verificam com chave/dados: Files API da Anthropic com PDF real (`anexarParaApi`), rotina `extrair-texto` em produção com um PDF enviado pela tela, policies de `storage.objects` (só existem no Supabase, não no CI).

## 4. O que ainda falta da Fase 1 (próximas sessões)

- Contratos e honorários (T1.37, condicional) com gerador de `.docx`.
- Playwright além da fumaça: tratar publicação, confirmar prazo, concluir tarefa, com Supabase local no CI.
- Template próprio `prazo_vencido` na Meta (hoje reaproveita `alerta_prazo`); erros da Graph API ainda não registram em Integrações.

## 5. Retomar no computador local (sessão de 29/10/2026)

Estado ao sair da nuvem: branch `claude/confident-darwin-5z65s7` (única, padrão) com 22 migrations, CI verde no commit `db6edd5`. O SQL consolidado (todas as migrations) já foi executado no projeto Supabase `qcikrqyzrtgfhtlfbabi`. Para continuar:

```bash
git clone https://github.com/renanbessa05/sistema-para-adv.git && cd sistema-para-adv
pnpm install
cp .env.example .env.local   # URL do Supabase, chave publishable, chave secret, ANTHROPIC_API_KEY, DATAJUD_API_KEY, RESEND...
pnpm dev
```

Próximos passos, nesta ordem: (1) no painel do Supabase, ativar o hook de claims, desligar sign-ups e habilitar TOTP (`docs/deploy.md`, seção 1, passos 3 e 3a); (2) inserir o escritório e a sócia (`docs/deploy.md`, seção 2) e convidar o e-mail; (3) importar o repositório na Vercel com as variáveis de ambiente; (4) entrar, cadastrar o autenticador em `/mfa/cadastro`, convidar a equipe; (5) carregar a carteira e rodar a primeira captação. Trocar a chave da API do Claude que circulou no chat.

## 6. Como rodar localmente

```bash
pnpm install
cp .env.example .env.local   # preencher
pnpm dev
```

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Os testes de banco precisam de um Postgres 16 em `postgres://adv_teste:adv_teste@127.0.0.1:5432/postgres` (ou `DATABASE_URL_TESTE`).
