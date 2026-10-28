# Regras de notificação

Implementadas em `src/lib/notificacoes/regras.ts` com override por escritório em `regras_notificacao`. Canal "painel" é o sininho na interface; "whatsapp" exige telefone verificado e, fora da janela de 24 h, template aprovado; "email" exige e-mail verificado.

| Evento | Destinatário | Canais | Quando | Template WhatsApp |
|---|---|---|---|---|
| Nova publicação vinculada a processo | Responsável do processo | painel, whatsapp | imediato (whatsapp só entre 7h e 20h local; fora disso, 7h do próximo dia útil) | `nova_publicacao` |
| Publicação sem processo na carteira | Administrativo e responsável, se houver | painel | imediato | — |
| Publicação sem tratamento há 24 h úteis | Responsável do processo | painel, whatsapp | de hora em hora, dias úteis | `publicacao_sem_tratamento` |
| Publicação sem tratamento há 48 h úteis | Sócios | painel, whatsapp, email | de hora em hora, dias úteis | `publicacao_sem_tratamento` |
| Prazo D-3 e D-1 (data final) | Responsável do processo | painel, whatsapp | 7h local, dias úteis | `alerta_prazo` |
| Prazo D0 | Responsável e sócios | painel, whatsapp, email | 7h local, sempre (inclusive fora do expediente) | `alerta_prazo` |
| Prazo vencido sem cumprimento | Responsável e sócios | painel, whatsapp, email | 0h05 local, no job que marca vencidos | `alerta_prazo` |
| Tarefa atrasada | Executor | painel; entra no resumo do dia | 7h30 | (no resumo) |
| Tarefa reatribuída | Novo executor | painel, whatsapp | imediato | `tarefa_reatribuida` |
| Resumo do dia | Cada usuário ativo | whatsapp, email (quem tiver), painel | 7h30 local, dias úteis | `resumo_do_dia` |
| Captação não rodou até as 9h | Sócios | email, whatsapp | 9h local, dias úteis | `publicacao_sem_tratamento` (texto de falha) |
| Calendário forense do próximo ano não carregado | Sócios e administrativo | painel, email | 1º dia útil de novembro e de dezembro | — |
| Convite para a equipe | Usuário convidado | email | imediato | — |

Regras gerais:
- **Ausência** (`ausencias`): notificações do ausente vão para o substituto cadastrado; sem substituto, para os sócios. A tela de tarefas sugere reatribuir as tarefas do ausente.
- **Deduplicação**: `chave_dedup` = evento + objeto + destinatário + canal + dia local. Uma notificação por dia por combinação.
- **Sigilo**: mensagens de WhatsApp e e-mail de processo em segredo de justiça trazem só o número do processo e o tipo de evento, nunca o texto.
- **Horário**: tudo em hora local do escritório; crons em UTC com deslocamento fixo de 4 h.
- **Opt-in**: ninguém recebe WhatsApp sem ter verificado o próprio telefone (código enviado pelo sistema) e aceito o termo.
