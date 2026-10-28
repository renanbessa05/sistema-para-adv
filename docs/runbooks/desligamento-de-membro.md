# Runbook: desligamento de alguém da equipe

Feito por um sócio, no dia do desligamento.

1. **Reatribuir** as tarefas abertas da pessoa (`/tarefas?executor=<pessoa>`) e os processos em que é responsável (`/processos?responsavel=<pessoa>`): escolher o novo responsável; os prazos seguem o responsável do processo.
2. **Desativar o membro** em Configurações → Equipe. O JWT da pessoa perde os claims no próximo refresh (até 1 hora).
3. **Encerrar as sessões agora**: no painel do Supabase, Authentication → Users → usuário → "Sign out user" (ou deletar o usuário se não precisar mais de histórico de login; os registros de aprovação e eventos continuam ligados ao `usuario_id`).
4. **Revogar o telefone** do WhatsApp (Configurações → Equipe → telefone → desativar). O número deixa de conversar com o sistema imediatamente.
5. Conferir se a pessoa tinha acesso a outros lugares: Vercel, Supabase, Meta Business, Resend, Google (Fase 2). Remover.
6. Registrar no inventário LGPD (`docs/lgpd/registro-operacoes.md`) que o acesso foi encerrado, com data.

Teste do runbook: fazer isso com um usuário de teste no projeto dev antes de precisar de verdade.
