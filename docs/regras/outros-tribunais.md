# Outros tribunais estaduais (análise fora de MT)

Fonte: skill `analise-processual-todos-tribunais` (`references/tribunais-codigos.md` e `camada-local.md`). O código de identificação está em `src/lib/tribunais/codigos.ts`; a camada local, no banco.

## Regra central
Nada de camada local sai como afirmação sem fonte. O seed `ref.tribunal_camada_local` (tribunal `*`, valendo para qualquer TJ fora de MT) traz os 8 blocos como **a verificar**. Um item vira **confirmado** só quando o sócio registra a confirmação em `/configuracoes/tribunais`, com fonte oficial (página do tribunal, provimento, tabela de custas ou o documento dos autos). A confirmação fica no escritório (`escritorio_camada_local`), por tribunal.

O agente recebe a camada local como dado delimitado e não completa nada de memória. Se o processo for de MT, a análise não roda e a tela manda para as habilidades próprias.

## Como o tribunal é identificado
Pelo número CNJ: segmento J deve ser 8 (Justiça estadual) e TR de 01 a 27, na ordem alfabética dos estados. TR 11 é o TJ-MT. A identificação não usa o endereço do cliente, nem o OOOO (unidade de origem não é deduzida do código).

## Onde aparece
- `/processos/[id]/outros-tribunais`: formulário com polo, objetivo e prazo (Passo 0 da skill) e a última análise.
- Resultado gravado em `analises` (tipo `outros_tribunais`), com o JSON estruturado e o relatório em Markdown.

## Pendências
- **Julgador (mapa de 6 camadas, skill `tjmt-skill-cl`)**: não feito neste lote. O registro do agente segue com `producao: false`.
- Calendário forense dos outros TJs: sem feriados cadastrados, o sistema deve marcar o cálculo de prazo como calendário incompleto (evento `calendario_incompleto`). Ainda não ligado.
- Confirmações reais: nenhum item está confirmado; a Bruna e a equipe precisam trazer as fontes de cada estado que for atendido.
