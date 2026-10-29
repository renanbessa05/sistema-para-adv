# ADR 0017: operação de produto com backup por tenant, status público e Sentry desligado

Status: aceito (lote 15).

## Contexto

O sistema já tem rotinas, LGPD e multi-escritório. Falta operar com segurança: saber quando uma rotina parou, ter cópia dos dados de cada escritório e um ponto público de saúde. O risco é gravar dado pessoal em lugar errado ou um alerta de erro levar conteúdo de processo para fora.

## Decisão

- Backup diário por escritório (`backup-tenant`, 06 h UTC) em `backups/<escritorio>/` no bucket privado `exportacoes`. Não apaga nada. Registro em `backups_tenant`. Verificação semanal (`verificar-backup`, segunda 07 h UTC).
- Acesso ao backup só por URL assinada de 300 s, nunca público e nunca por e-mail.
- `scripts/restaurar-tenant.ts` faz só dry-run. A restauração real fica fora deste lote.
- `/admin/status` (sócio e suporte) alerta rotina sem execução no limite dela: 24 h para rotinas diárias, 96 h para as de dias úteis e 8 dias para `verificar-backup`.
- `/status` é público e mostra só contagens agregadas de saúde, sem nome de escritório.
- Sentry: a sanitização (`src/lib/operacao/sentry.ts`) existe e está testada, mas o pacote `@sentry/nextjs` não foi instalado neste lote. Sem `SENTRY_DSN` a integração fica desligada. Instalar depende de decisão do responsável (a confirmar).
- Incidentes em `incidentes`, com RLS, MFA restritiva e escrita só pela service role.

## Consequências

- Backup contém dados pessoais e exige o mesmo cuidado que a exportação LGPD. Um job que falhar no meio deixa o registro como erro, não como backup válido.
- Rotinas de dias úteis têm limite mais longo para não alertar no fim de semana. Desvio do limite de 24 h, deliberado.
- A leitura completa de cada tabela é paginada em memória: tenants muito grandes podem exigir revisão do limite de `maxDuration` (a confirmar no plano Vercel).
- Testes de banco da migration 0053 não foram escritos nem executados neste lote.
