# ADR 0020: relatórios de produtividade com view materializada por usuário e CSV

Status: aceito (lote 11).

## Contexto

O escopo pede produtividade por pessoa, prazos cumpridos e vencidos e exportação, sem vazar dados entre escritórios. Já existia `metricas_diarias`, lida só pela tela de sócio. Faltava a visão por usuário, com regra de acesso diferente (sócio e advogado; sigilo só para sócio).

## Decisão

- Nova view materializada `metricas_mensais_usuario` (migration 0044), por escritório, usuário, mês e sigilo, renovada pela mesma função `atualizar_metricas_diarias()`, que passou a renovar as duas views.
- Leitura só pela RPC `metricas_usuarios_do_escritorio`: escritório do JWT, MFA, papel sócio ou advogado, sigilo só para sócio. A service role (job) informa o escritório.
- Cálculos (taxa de cumprimento, média de revisão, CSV) em `src/lib/relatorios`, puros e com cobertura total.
- Agendamento em `relatorios_agendados` (só sócio). A rotina `relatorio-mensal` grava o CSV no bucket `exportacoes`, com policy restritiva para o prefixo de relatório.
- Exportação sob demanda pela rota `/api/relatorios/csv`, sem passar pelo bucket.

## Consequências

- A view tem o mesmo atraso da `metricas_diarias`: vale o último refresh das 3h UTC. Um mês em andamento aparece com o que foi renovado até então.
- Prazos vencidos são atribuídos ao responsável, e não a quem registrou. Os outros números são de quem executou. A tela explica isso.
- Taxa de cumprimento é uma proposta, marcada como a confirmar com a advogada.
- Não há e-mail mensal. O plano o previa; fica pendente.
- O teste de banco da migration 0044 não foi escrito nem executado neste lote. Nada aqui foi validado num Postgres local.
