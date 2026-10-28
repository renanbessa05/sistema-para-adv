# Runbook: calendário forense do ano (e alterações durante o ano)

O motor de prazos só é confiável com o calendário completo do ano, por comarca. Esta rotina é do administrativo, com conferência de um sócio.

## Todo ano, em novembro ou dezembro

1. Baixar a Portaria do TJ-MT com o calendário forense do próximo ano (em 2025 foi a Portaria TJMT/PRES 1915/2025, de 05/12/2025, para 2026). Fonte: portal do TJ-MT → Transparência → Portarias, ou a intranet. Guardar o PDF em `docs/fase0/` ou no Drive do escritório.
2. Em Configurações → Calendário, selecionar o próximo ano e cadastrar, um a um: feriados nacionais (já vêm carregados), estaduais, pontos facultativos, dias forenses (Carnaval, Cinzas, Corpus Christi, Servidor Público, Dia da Justiça) e o que mais a Portaria listar, com o número da Portaria no campo "ato normativo".
3. Cadastrar os feriados municipais de **cada comarca** em que o escritório tem processo (aniversário da cidade, padroeiro). Feriado municipal só suspende prazo na própria comarca.
4. Marcar o ano como **conferido** (um sócio confere contra o PDF). Até isso, os prazos do ano nascem com o aviso "calendário incompleto".

## Durante o ano

- O TJ-MT altera o calendário por portarias avulsas (em 2026: portarias 245, 509, 752, 901 e a transferência do ponto facultativo de 28/10 para 30/10). Também há suspensões por indisponibilidade do sistema (ex.: incidente de 21 a 25/09/2026).
- Fonte de alerta: o DJEN/DJE do TJ-MT publica as portarias; o painel do advogado no PJe mostra avisos. Tarefa mensal do administrativo: conferir "Portarias" do mês no site do TJ-MT.
- Cadastrar a suspensão como `suspensao_ad_hoc` com o ato normativo. Prazos já confirmados que atravessam a suspensão precisam ser **prorrogados manualmente** (o sistema não recalcula prazo confirmado sozinho; ele avisa na tela do prazo que houve alteração do calendário no período, quando implementado).

## Fontes

- Calendário 2026: Portaria TJMT/PRES 1915/2025 (https://www.tjmt.jus.br/paginas/transparencia-e-prestacao-contas?url=%2FInstitucional%2FC%2F82478)
- Recesso: CPC art. 220 (20/12 a 20/01), gerado automaticamente pelo motor.
- Feriados nacionais: Lei 10.607/2002, Lei 662/1949, Lei 6.802/1980, Lei 14.759/2023.
