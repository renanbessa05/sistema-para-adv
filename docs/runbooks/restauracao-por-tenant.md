# Runbook: restauração por escritório

Os backups são snapshots diários (06 h UTC) das tabelas de negócio de **cada** escritório, em `backups/<escritorio>/` no bucket privado `exportacoes`. Não há restauração automática: é um procedimento manual e exige sócio ciente.

## Regras

- O backup contém dados pessoais. Nunca enviar por e-mail, WhatsApp ou outro serviço, e nunca copiar para fora do Supabase.
- O acesso é por URL assinada de 300 segundos, gerada pelo próprio script.
- `scripts/restaurar-tenant.ts` roda em **dry-run** por padrão e não grava nada. A restauração real não está implementada neste lote (a confirmar).

## Passos (somente leitura)

1. Confirmar o escritório e o motivo (pedido por escrito do sócio).
2. Rodar: `pnpm exec tsx --env-file=.env.local scripts/restaurar-tenant.ts --escritorio <uuid>`. Opcional: `--backup <caminho>` para outro dia.
3. Conferir a tabela de contagens (backup × banco agora). Diferença grande é sinal para investigar, não para restaurar às cegas.
4. Anexar a saída ao registro do incidente (sem colar dados pessoais).

## Restauração real (a confirmar)

Antes de qualquer escrita, decidir: restaurar em banco separado e exportar a diferença, ou sobrescrever. Hoje o procedimento não existe no código; qualquer escrita precisa de revisão técnica e de sócio, com cópia do estado atual antes.

## Verificação semanal

O job `verificar-backup` roda às segundas, 07 h UTC, e falha se o último backup tiver mais de 36 h, não estiver no Storage ou tiver tamanho muito menor que o anterior. A falha aparece em `/admin/status`.
