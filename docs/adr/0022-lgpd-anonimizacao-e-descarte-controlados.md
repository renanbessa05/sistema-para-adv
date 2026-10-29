# ADR 0022: LGPD com anonimização irreversível e descarte desligado por padrão

Status: aceito (lote 12).

## Contexto

O escopo pede inventário, pedidos dos titulares, exportação, anonimização e descarte de retenção. Apagar dados é irreversível e pode quebrar a retenção legal de processos. O risco maior é um job apagar algo que o escritório precisava guardar.

## Decisão

- Inventário em `operacoes_tratamento`, semeado de `docs/lgpd/registro-operacoes.md` e por trigger em novos escritórios.
- Pedidos em `lgpd_solicitacoes`; o prazo é informado por quem registra, sem valor fixo no código.
- Retenção em `politicas_retencao`: prazo NULL = sem descarte. A constraint do banco impede política ativa sem prazo e sem confirmação. Ativar exige a frase ATIVAR DESCARTE na RPC `lgpd_configurar_politica`.
- O job `descarte-retencao` só apaga (mensagens do WhatsApp e webhooks já processados) quando a política está ativa e confirmada. Os demais tipos são apenas contados.
- Anonimização por RPC `lgpd_anonimizar_titular`: exige sócio com MFA e o nome digitado. Troca dados pessoais; mantém processos e aprovações. Não altera arquivos do Storage nem conversas do WhatsApp.
- Exportação do titular em ZIP (`src/server/lgpd.ts`), no bucket `exportacoes`, prefixo `lgpd/`, legível só pelo sócio, com link de 5 minutos.
- Cálculos puros em `src/lib/lgpd` com cobertura total.

## Consequências

- Nada é apagado até um sócio ativar uma política. Isso é deliberado, mesmo que deixe dados além do prazo.
- Anonimização não cobre arquivos nem o WhatsApp: pendência registrada no runbook.
- Prazos de retenção sugeridos (12, 3, 60 meses) são ponto de partida e estão a confirmar.
- Testes de banco da migration 0045 não foram escritos nem executados neste lote.
