# Relatórios de produtividade (lote 11)

## Quem vê o quê
- **Sócio**: todas as pessoas, inclusive processos em segredo de justiça. Baixa o CSV e liga o relatório mensal.
- **Advogado**: todas as pessoas, sem as linhas de processos em segredo de justiça. Exige segundo fator (MFA).
- **Estagiário e administrativo**: não veem métricas de usuários. A RPC recusa (42501).

## De onde vêm os números
View materializada `metricas_mensais_usuario` (migration 0044), por escritório, pessoa, mês civil (fuso do escritório) e sigilo:
- tarefas concluídas (`concluida_por`), prazos confirmados (`confirmado_por`), prazos cumpridos (`cumprido_por`);
- prazos vencidos, atribuídos ao responsável (`responsavel_id`) pelo mês do vencimento;
- publicações tratadas (`tratada_por`); aprovações decididas (`aprovador_id`) e tempo de revisão humana.

A view é renovada pela rotina `atualizar-metricas` (3h UTC, todo dia). Sem RLS e sem acesso direto: a leitura é só pela RPC `metricas_usuarios_do_escritorio`, que filtra pelo escritório do JWT.

## Definições
- **Taxa de cumprimento** = prazos cumpridos / (cumpridos + vencidos). Sem prazos no mês, não há taxa (mostra "—"). Definição (a confirmar com a advogada): ainda não validada.
- **Tempo de revisão médio** = soma do tempo de revisão humana das aprovações / número de aprovações decididas, em segundos.
- Relatório sem IA: custo e acerto da IA ficam em `/admin/ia` e `/admin/metricas`.
- "Tempo economizado" (baseline por tipo de tarefa) não entra neste lote.

## Exportação e agendamento
- Tela `/relatorios` (mês escolhido) com gráfico e tabela; botão "Baixar CSV" chama `/api/relatorios/csv?mes=AAAA-MM`.
- `/configuracoes/relatorios` (só sócio) liga o relatório mensal. A rotina `relatorio-mensal` (dia 1, 11h UTC = 07h em Cuiabá) gera o CSV do mês anterior no bucket `exportacoes`, com prefixo `relatorio-produtividade-`. Só o sócio lê esse prefixo (policy restritiva no Storage).
- O CSV usa `;` como separador, vírgula decimal e BOM. Textos que começam com `=`, `+`, `-`, `@` ganham apóstrofo.
- **Não há envio por e-mail.** O plano previa "relatório mensal por e-mail"; fica como pendência, a decidir com o escritório.

## Código
- `src/lib/relatorios/agregar.ts` e `csv.ts`: puros, com 100% de cobertura (threshold no `vitest.config.ts`).
- `src/server/relatorios.ts`: chamada da RPC. `src/server/jobs/relatorio-mensal.ts`: job.
