# ADR 0002: WhatsApp pela Cloud API da Meta, direto, sem provedor intermediário

Data: 28/10/2026. Situação: aceita.

## Contexto
Só a API oficial é aceitável: os termos do WhatsApp proíbem clientes não oficiais e a Meta bane números que os usam. A equipe tem poucas pessoas (ordem de 5 telefones). Desde 01/10/2026 a Meta cobra por mensagem também as de serviço, após 1.000 grátis por número por mês; templates utility custam cerca de R$ 0,035.

## Decisão
Integração direta como "direct developer": conta Meta Business verificada, número novo dedicado, token de usuário de sistema com `whatsapp_business_messaging` e `whatsapp_business_management`, webhook em `/api/whatsapp/webhook` com verificação de assinatura. Mensagens iniciadas pelo sistema (resumo do dia, alertas) saem como templates utility aprovados. A interface `src/lib/whatsapp` isola o provedor: se a verificação da Meta travar, um BSP oficial entra atrás da mesma interface.

## Consequências
Sem mensalidade de provedor. É preciso criar e aprovar os templates antes de ir ao ar, respeitar a janela de 24 h, nunca pedir documento ou dado bancário pelo chat e dar opt-in a cada telefone da equipe. A inbox de webhooks é idempotente pelo `wamid` porque a Meta reenvia por até 7 dias.
