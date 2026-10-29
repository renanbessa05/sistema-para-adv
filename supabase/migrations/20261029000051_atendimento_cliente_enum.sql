-- 0051: evento de notificação para pedido de contato de cliente (Fase 2, lote 14)
--
-- Valor novo em migration própria: o uso só entra na migration seguinte (0052), porque um valor de enum criado
-- numa transação não pode ser usado na mesma transação (o harness roda cada arquivo numa transação).

alter type public.evento_notificacao add value if not exists 'cliente_pediu_contato';
