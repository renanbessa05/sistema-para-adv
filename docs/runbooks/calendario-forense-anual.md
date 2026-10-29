# Runbook: calendário forense do ano (e alterações durante o ano)

O motor de prazos só é confiável com o calendário completo do ano, por comarca. Esta rotina é do administrativo, com conferência de um sócio. Serve para qualquer tribunal atendido pelo escritório; o exemplo de TJ-MT vem entre parênteses.

**Regra deste sistema:** o calendário do ano é cadastrado a partir da portaria oficial do tribunal. Nenhum feriado, ponto facultativo ou suspensão é inventado pelo código nem pela IA. Se a portaria não estiver disponível, o ano fica como "calendário incompleto" e o sócio decide (a confirmar).

## Todo ano, em novembro ou dezembro

1. Baixar a portaria do tribunal com o calendário forense do próximo ano (no TJ-MT, a portaria de calendário é publicada no fim do ano anterior; o número e a data ficam na própria portaria). Fonte: portal de transparência do tribunal ou intranet. Guardar o PDF em `docs/fase0/` ou no Drive do escritório.
2. Em Configurações → Calendário, selecionar o próximo ano e cadastrar, um a um: feriados nacionais (já vêm carregados), estaduais, pontos facultativos, dias forenses e o que mais a portaria listar, com o número da portaria no campo "ato normativo".
3. Cadastrar os feriados municipais de **cada comarca** em que o escritório tem processo. Feriado municipal só suspende prazo na própria comarca.
4. Marcar o ano como **conferido** (um sócio confere contra o PDF). Até isso, os prazos do ano nascem com o aviso "calendário incompleto".

## Durante o ano

- O tribunal altera o calendário por portarias avulsas e pode suspender prazos por indisponibilidade do sistema. Cada alteração vira um registro `suspensao_ad_hoc` com o ato normativo e o período.
- Fonte de alerta: o diário oficial e os avisos do sistema de processo eletrônico. Tarefa mensal do administrativo: conferir as portarias publicadas no mês.
- Prazos já confirmados que atravessam a suspensão precisam ser **prorrogados manualmente**. O sistema não recalcula prazo confirmado sozinho.

## Fontes

- Portaria do calendário do tribunal: citar número e data na própria configuração (não copiar valores de outro ano).
- Recesso e prazos processuais: conferir o código de processo aplicável ao caso (a confirmar pelo responsável jurídico).
- Feriados nacionais: legislação federal vigente, carregada pelo cadastro do sistema.
