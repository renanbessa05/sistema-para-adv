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
| Divergências da operação paralela (`/admin/divergencias`): ver | ✓ | ✓ | ✓ | ✓ |
| Divergências: registrar e resolver | ✓ | ✓ | ✗ | ✓ |
| Configurações → Integrações (segredos do WhatsApp e DataJud no Vault) | ✓ (com segundo fator) | ✗ | ✗ | ✗ |
| Configurações → Segurança (próprios autenticadores) | ✓ | ✓ | ✓ | ✓ |
| Retomar prazo suspenso; suspender/prorrogar de novo | ✓ | mesma regra de confirmar | ✗ | ✗ |
| Aceitar convite pendente para a própria conta (`/convite/aceitar`) | ✓ | ✓ | ✓ | ✓ |
| Ver auditoria de acessos | ✓ | ✗ | ✗ | ✗ |
| Gerar contrato de honorários (fim da Fase 1) | ✓ | ✓ | ✗ (preenche formulário) | ✓ (preenche formulário) |
| Aprovar contrato | ✓ | ✓ | ✗ | ✗ |

Regras gerais: MFA obrigatório para sócio e advogado; usuário desativado perde acesso no próximo refresh do token (até 1 h) e tem as sessões encerradas pelo runbook de desligamento; toda leitura de texto de processo sigiloso vai para `auditoria_acessos`.

## Segundo fator

Sócio e advogado só usam o sistema com segundo fator (TOTP, aplicativo autenticador); estagiário e administrativo não são exigidos (podem cadastrar). Implementação na migration `20261029000016_mfa_obrigatorio.sql`, testada em `supabase/tests/mfa.test.ts`:

- O Supabase Auth grava no JWT o claim `aal`: `aal1` = entrou só com senha ou link; `aal2` = confirmou o código do autenticador nesta sessão. O Custom Access Token Hook preserva esse claim (parte de `event -> 'claims'` e só acrescenta `escritorio_id` e `papel`).
- `app.mfa_satisfeita()` (redefinida em `20261029000022`) devolve `true` quando: o papel não é sócio nem advogado; **ou** a sessão é `aal2`; **ou** o usuário nunca verificou um fator em `auth.mfa_factors` **e a conta tem menos de 7 dias** (carência para cadastrar o primeiro; fator só iniciado, `unverified`, não conta); **ou** é a service role (jobs). Fora disso, `false`. Passados os 7 dias, sócio ou advogado sem fator fica sem dados até cadastrar um; remover o último fator de uma conta antiga não reabre o acesso só com senha (por isso a tela de Segurança não deixa remover o último autenticador verificado desses papéis).
- Policy restritiva `mfa_obrigatorio` (`as restrictive for all to authenticated using (app.mfa_satisfeita())`) em `processos`, `processo_partes`, `processo_assuntos`, `processo_colaboradores`, `movimentacoes`, `clientes`, `publicacoes`, `publicacao_eventos`, `captacoes`, `prazos`, `prazos_eventos`, `atos_prazo`, `tarefas`, `tarefa_eventos`, `aprovacoes`, `ia_execucoes`, `auditoria_acessos`, `notificacoes`, `regras_notificacao`, `ausencias`, `conversas`, `mensagens`, `integracoes`, `divergencias_operacao`, `exportacoes`, `fases_kanban` (e `documentos`, quando existir). Soma-se às policies permissivas: sem `aal2`, a consulta devolve zero linhas e a escrita é negada.
- Em `escritorios`, `escritorio_membros`, `usuario_telefones` e `escritorio_configuracoes` a **leitura** segue livre (o layout e a tela de cadastro do fator precisam delas antes do `aal2`), mas **inserir, alterar e apagar** exigem `app.mfa_satisfeita()` (policies `mfa_obrigatorio_insert/update/delete`): uma sessão só com senha não convida membro, não promove papel e não cadastra telefone.
- As RPCs de decisão (`confirmar/rejeitar/suspender/prorrogar/retomar/cumprir/cancelar_prazo` via `app.prazo_para_decisao`, `decidir_aprovacao`, `transicionar_publicacao`, `publicacao_texto`, `marcar_sigilo`, `criar/reatribuir/alterar_status/concluir/cancelar_tarefa`, `gerar_codigo_telefone`, `integracao_definir_segredo`, `integracao_remover_segredo`) levantam `42501 Segundo fator obrigatório` em vez de falhar em silêncio.
- `ref.*` fica fora (dados públicos de referência).
- WhatsApp: as ações confirmadas pelo WhatsApp passam por `whatsapp_executar`, que roda como service role com um telefone verificado e vinculado ao usuário; esse canal não exige `aal2` (o telefone verificado é a posse do dispositivo). Sócio ou advogado sem fator cadastrado segue podendo confirmar pelo WhatsApp (a confirmar se o escritório quer bloquear também esse canal).

No app: o layout do painel (`src/server/mfa.ts`) manda sócio/advogado sem fator verificado para `/mfa/cadastro` e, com fator mas sessão `aal1`, para `/mfa`. Essas duas telas ficam fora do painel. Os próprios fatores ficam em Configurações → Segurança (`/configuracoes/seguranca`); remover um fator exige `aal2` no Auth. O redirecionamento é conveniência; a barreira é a policy.
