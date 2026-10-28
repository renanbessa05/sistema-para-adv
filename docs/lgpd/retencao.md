# Retenção e descarte

| Dado | Prazo | Como |
|---|---|---|
| Processos, publicações, prazos, tarefas, aprovações, eventos | 5 anos após o arquivamento do processo (prazo prescricional de responsabilidade civil do advogado) | Job de descarte (Fase 3) marca e apaga; até lá, descarte manual pelo sócio |
| Texto das publicações e resumos de IA de processo que virou sigiloso | imediato: o resumo da IA é apagado quando o processo é marcado sigiloso | `marcar_sigilo` (a implementar na Fase 1, semana 9: apagar `resumo_ia` e bloquear reenvio) |
| Conversas do WhatsApp | mensagens 1 ano; metadados 5 anos | Job de descarte (Fase 3) |
| Inbox de webhooks | 90 dias | Job de descarte |
| Exportações CSV | 90 dias no bucket | Política do bucket |
| Execuções de IA (tokens, custo) | 5 anos (base das métricas) | — |
| Logs da Vercel | conforme o plano (dias) | — |
| Backups do Supabase | 7 dias (Pro) | — |
| Dados de membro desligado | conta desativada no dia; registros históricos mantidos pelo prazo acima | runbook de desligamento |
