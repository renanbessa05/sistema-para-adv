-- 0037: evento de notificação para audiência no dia seguinte (lote 8). Enum em migration própria.
alter type public.evento_notificacao add value if not exists 'audiencia_d1';
