# Runbook: operação paralela (até o sistema provar que não perde prazo)

Período: da primeira semana real de uso até completar 4 semanas em período forense normal com zero divergência não explicada (fora do recesso de 20/12 a 20/01), e depois até 2 a 3 meses sem prazo perdido (critério para virar produto).

## Todo dia

- O administrativo confere o PJe (painel do advogado → expedientes) e os e-mails de intimação e compara com a caixa de publicações do painel. O que não apareceu no sistema é lançado em `/publicacoes/nova` e anotado como divergência.
- A advogada responsável confirma ou rejeita os prazos sugeridos no mesmo dia, lendo a memória de cálculo.

## Toda sexta-feira (30 minutos)

1. Abrir `/prazos?periodo=semana` e o painel do advogado no PJe lado a lado.
2. Para cada prazo das próximas duas semanas: a data final bate? Se não, registrar em "Divergências" (planilha compartilhada, ou a tela `/admin/divergencias` quando existir): prazo, o que divergiu, causa (feriado faltando, classificação errada, publicação não captada, cadastro do advogado errado no processo), correção feita.
3. Contar: publicações captadas × publicações vistas no PJe; prazos sugeridos × confirmados sem alteração de data (acerto da IA); tarefas atrasadas.
4. Decidir se o sistema pode ser a fonte principal (critério: 4 semanas seguidas sem divergência não explicada).

## O que registrar para o critério de passagem

| Métrica | Onde | Meta |
|---|---|---|
| Cobertura da captação | cruzamento semanal | 100% das intimações a advogado vistas no PJe |
| Acerto da data sugerida | `/admin/status` (view ia_acerto) | ≥ 95% |
| Acerto do tipo de ato | idem | ≥ 95% |
| Publicações tratadas em 24 h úteis | `/publicacoes` | 100% |
| Prazos perdidos | reunião | 0 |
