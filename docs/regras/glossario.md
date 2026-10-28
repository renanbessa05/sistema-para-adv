# Glossário operacional

Definições que o código usa. Mudou aqui, muda no código.

- **Hoje**: data civil no fuso do escritório (`escritorios.timezone`, padrão America/Cuiaba, UTC-4, sem horário de verão). Calculada por `hojeNoFuso`. Nunca pela data do servidor.
- **Amanhã**: próximo dia útil depois de hoje. Na sexta, "amanhã" é segunda (ou o próximo dia útil).
- **Semana**: os dias úteis restantes da semana corrente mais a próxima segunda-feira. Configurável por escritório (`semana_inclui_proxima_segunda`).
- **Prazos da semana**: prazos confirmados ou prorrogados cuja data final está na semana, listados com data final e data interna. Inclui os vencidos não cumpridos.
- **Prazos de hoje**: data final igual a hoje. **Prazos vencendo amanhã**: data final igual a amanhã.
- **Data fatal**: a data final do prazo. **Data interna**: data final menos os dias úteis de segurança do ato.
- **Publicação nova**: status `nova`, `classificada`, `vinculada` ou `sem_processo` captada nas últimas 24 h úteis.
- **Publicação sem tratamento**: ver `estados.md`. O alerta de 24 h é contado em horas úteis (dias úteis, 8h às 18h local).
- **Tarefa atrasada**: vencimento (data interna) passou e a tarefa não está concluída nem cancelada.
- **Tarefa crítica**: a data final do prazo ligado é hoje ou já passou.
- **Processo ativo**: status `ativo` ou `suspenso` (não `arquivado` nem `baixado`).
- **Painel do dia (`/hoje`)**: visão do usuário logado (processos em que é responsável ou colaborador, tarefas em que é executor). Sócio alterna para "escritório".
- **Responsável** do processo: advogado dono. **Colaboradores**: quem também atua nele. **Executor** da tarefa: quem faz; pode ser diferente do responsável do processo.
- **Resumo do dia**: mensagem das 7h30 (local), dias úteis, por usuário ativo: publicações novas, prazos de hoje, de amanhã e da semana, tarefas atrasadas. Sócio recebe também os totais do escritório.
- **Horas úteis**: segunda a sexta, 8h às 18h local, fora de feriados do calendário do tribunal.
- **Escritório**: tenant. Tudo que o escritório produz tem `escritorio_id`. Dados de referência (tribunais, comarcas, feriados, TPU, preços de IA) são globais, no schema `ref`.
