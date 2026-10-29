# Runbook: operação paralela (até o sistema provar que não perde prazo)

Período: da primeira semana real de uso até completar 4 semanas em período forense normal com zero divergência não explicada (fora do recesso de 20/12 a 20/01), e depois até 2 a 3 meses sem prazo perdido (critério para virar produto).

## Todo dia

- O administrativo confere o PJe (painel do advogado → expedientes) e os e-mails de intimação e compara com a caixa de publicações do painel. O que não apareceu no sistema é lançado em `/publicacoes/nova` e registrado em `/admin/divergencias` (tipo "Publicação não captada").
- A advogada responsável confirma ou rejeita os prazos sugeridos no mesmo dia, lendo a memória de cálculo.

## Toda sexta-feira (30 minutos)

1. Abrir `/prazos?periodo=semana` e o painel do advogado no PJe lado a lado.
2. Para cada prazo das próximas duas semanas: a data final bate? Se não, registrar na tela `/admin/divergencias` (tabela `divergencias_operacao`): semana (a sexta da conferência, já preenchida), tipo (data do prazo, publicação não captada, classificação errada, cadastro do advogado, prazo não sugerido, outro), o que divergiu, causa (feriado faltando, classificação errada, publicação sem OAB, cadastro do advogado errado no processo) e correção feita. Na página do prazo há o link "Registrar divergência", que já preenche prazo e processo.
3. Divergência sem causa preenchida conta como **não explicada** e zera a contagem daquela semana; preencha a causa ao resolver. Se a semana não teve divergência, registre mesmo assim um item do tipo "Outro" com causa "conferência sem divergência": é o que marca que a conferência foi feita e faz a contagem começar.
4. Contar: publicações captadas × publicações vistas no PJe; prazos sugeridos × confirmados sem alteração de data (acerto da IA); tarefas atrasadas.
5. Decidir se o sistema pode ser a fonte principal (critério: 4 semanas seguidas sem divergência não explicada). O topo de `/admin/divergencias` mostra "semanas consecutivas limpas" contra a meta de 4, contadas da última sexta concluída para trás, a partir da primeira semana registrada. Semanas do recesso (20/12 a 20/01) não são descontadas automaticamente pela tela (a confirmar se o escritório prefere pausar a contagem no recesso).

## O que registrar para o critério de passagem

| Métrica | Onde | Meta |
|---|---|---|
| Cobertura da captação | cruzamento semanal (`/admin/divergencias`, tipo "Publicação não captada") | 100% das intimações a advogado vistas no PJe |
| Acerto da data sugerida | `/admin/status` (view ia_acerto) | ≥ 95% |
| Acerto do tipo de ato | idem | ≥ 95% |
| Publicações tratadas em 24 h úteis | `/publicacoes` | 100% |
| Prazos perdidos | reunião; `/prazos?status=vencido` e alerta `prazo_vencido` | 0 |
| Semanas seguidas sem divergência não explicada | `/admin/divergencias` (resumo no topo) | 4 |
