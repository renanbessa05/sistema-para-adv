# Runbook: desligamento de alguém da equipe

Feito por um sócio, no dia do desligamento.

1. **Reatribuir** as tarefas abertas da pessoa (`/tarefas?executor=<pessoa>`) e os processos em que é responsável (`/processos?responsavel=<pessoa>`): escolher o novo responsável; os prazos seguem o responsável do processo.
2. **Desativar o membro** em Configurações → Equipe. O JWT da pessoa perde os claims no próximo refresh (até 1 hora).
3. **Encerrar as sessões agora**: no painel do Supabase, Authentication → Users → usuário → "Sign out user" (ou deletar o usuário se não precisar mais de histórico de login; os registros de aprovação e eventos continuam ligados ao `usuario_id`).
4. **Remover os fatores de MFA** da pessoa: no painel do Supabase, Authentication → Users → usuário → seção de fatores MFA → remover cada fator (a confirmar o nome exato da seção no painel; alternativa: Admin API `auth.admin.mfa.deleteFactor({ id, userId })` com a chave secret). Sem isso, um autenticador num celular antigo continua válido se o usuário for reativado por engano.
5. **Revogar o telefone** do WhatsApp (Configurações → Equipe → telefone → desativar). O número deixa de conversar com o sistema imediatamente.
6. Conferir se a pessoa tinha acesso a outros lugares: Vercel, Supabase, Meta Business, Resend, Google (Fase 2). Remover.
7. Registrar no inventário LGPD (`docs/lgpd/registro-operacoes.md`) que o acesso foi encerrado, com data.

Teste do runbook: fazer isso com um usuário de teste no projeto dev antes de precisar de verdade.
