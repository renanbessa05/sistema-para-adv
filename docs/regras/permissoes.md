# Matriz de permissões por papel

Papéis: **sócio**, **advogado**, **estagiário**, **administrativo**. Todo usuário pertence a um escritório; nada atravessa escritórios. As células viram policies de RLS e checagens nas RPCs; o teste `supabase/tests/002_papeis` cobre cada uma.

| Ação | Sócio | Advogado | Estagiário | Administrativo |
|---|---|---|---|---|
| Ver painel do dia (próprio) | ✓ | ✓ | ✓ | ✓ |
| Ver painel do escritório inteiro | ✓ | ✗ | ✗ | ✗ |
| Ver processos, partes, movimentações | ✓ | ✓ | ✓ | ✓ |
| Ver texto de publicação de processo comum | ✓ | ✓ | ✓ | ✓ |
| Ver texto de publicação de processo em segredo de justiça | ✓ | só se responsável ou colaborador | ✗ | ✗ (vê só número e data) |
| Cadastrar/editar processo e cliente | ✓ | ✓ | ✗ (propõe) | ✓ |
| Marcar processo como sigiloso | ✓ | ✓ | ✗ | ✗ |
| Importar carteira (CSV) | ✓ | ✓ | ✗ | ✓ |
| Tratar publicação: cadastrar na carteira, "não é nosso", duplicada | ✓ | ✓ | ✗ | ✓ |
| Lançar publicação manual (PJe, e-mail) | ✓ | ✓ | ✗ | ✓ |
| Confirmar, rejeitar, suspender, cumprir, cancelar prazo | ✓ | só dos processos em que é responsável ou colaborador | ✗ | ✗ |
| Reconhecer "calendário incompleto" ao confirmar | ✓ | ✓ (mesma regra) | ✗ | ✗ |
| Criar tarefa | ✓ | ✓ | ✓ (para si) | ✓ |
| Reatribuir tarefa | ✓ | ✓ (das que é responsável ou executor) | ✗ | ✓ (tarefas administrativas) |
| Concluir tarefa | ✓ | ✓ | ✗ (até `pronta_para_revisao`) | ✓ (tarefas administrativas, sem prazo ligado) |
| Ver fila de aprovação e aprovar | ✓ | ✓ (seus objetos) | ✗ | ✗ |
| Configurações do escritório, equipe, atos, fases, notificações | ✓ | ✗ | ✗ | ✗ |
| Calendário forense: adicionar feriado ou suspensão | ✓ | ✗ | ✗ | ✓ |
| Ausências: cadastrar a própria | ✓ | ✓ | ✓ | ✓ |
| Ausências: cadastrar de outros | ✓ | ✗ | ✗ | ✓ |
| Telefone do WhatsApp: cadastrar o próprio | ✓ | ✓ | ✓ | ✓ |
| Revogar telefone de outro | ✓ | ✗ | ✗ | ✗ |
| Usar o WhatsApp: intents de leitura | ✓ | ✓ | ✓ (sem texto de sigilosos) | ✓ |
| Usar o WhatsApp: reatribuir/concluir tarefa, confirmar prazo | ✓ | ✓ (mesmas regras do painel) | ✗ | ✗ |
| Ver custos de IA e métricas | ✓ | ✗ | ✗ | ✗ |
| Ver status das rotinas (`/admin/status`) | ✓ | ✓ | ✗ | ✓ |
| Ver auditoria de acessos | ✓ | ✗ | ✗ | ✗ |
| Gerar contrato de honorários (fim da Fase 1) | ✓ | ✓ | ✗ (preenche formulário) | ✓ (preenche formulário) |
| Aprovar contrato | ✓ | ✓ | ✗ | ✗ |

Regras gerais: MFA obrigatório para sócio e advogado; usuário desativado perde acesso no próximo refresh do token (até 1 h) e tem as sessões encerradas pelo runbook de desligamento; toda leitura de texto de processo sigiloso vai para `auditoria_acessos`.
