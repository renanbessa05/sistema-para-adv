# Runbook: pedido de titular (LGPD)

Quem opera: sócio, em Configurações → LGPD. Nada disto é feito por rotina; cada passo é uma ação humana registrada.

## 1. Receber e registrar

1. Registre o pedido em "Pedidos dos titulares": titular (cadastrado ou digitado), tipo e prazo de resposta.
2. O prazo deve vir da advogada/DPO (a confirmar). O sistema não fixa prazo legal.
3. Confirme a identidade de quem pede antes de liberar qualquer dado (procedimento a confirmar).

## 2. Acesso e portabilidade

1. Em "Exportar dados de um titular", gere o ZIP. O link dura 5 minutos; baixe logo.
2. O ZIP traz cadastro, processos em que o titular é parte e metadados dos documentos. Conteúdo dos arquivos anexados NÃO está no ZIP: envie por canal seguro, se o pedido exigir (a confirmar).
3. Registre a resposta e marque como "Atendido".

## 3. Correção

Corrija o cadastro em Clientes; depois registre a resposta. Dados de processo seguem a regra do processo.

## 4. Eliminação (anonimização)

Antes de agir, confirme que não há obrigação de retenção aplicável (a confirmar com a advogada).

1. Escolha o titular, digite o nome completo exato e marque a caixa de ciência. A ação é irreversível.
2. O sistema anonimiza cadastro e partes de processos; processo e aprovações permanecem.
3. Revise os documentos apontados no aviso (o arquivo no armazenamento não é alterado pelo sistema).
4. Pendências conhecidas, fora do alcance da ação: mensagens e telefone em conversas do WhatsApp, e arquivos anexados. Trate-as pela política de descarte ou manualmente (a confirmar).

## 5. Revogação do consentimento

Interrompa o uso dos dados que dependiam do consentimento (hoje, o canal WhatsApp do próprio membro: desligue o opt-in em Equipe). Registre a resposta.

## 6. Fechamento

- Toda resposta fica em "Pedidos dos titulares" com data. Ações de exportação, anonimização e configuração ficam no registro de ações da tela.
- Se o pedido for indeferido, registre o motivo legal (a confirmar).

## Retenção automática

Só age o que o sócio ativou com a frase ATIVAR DESCARTE. Padrão: nada é apagado. O job `descarte-retencao` roda domingo, 01h (Cuiabá).
