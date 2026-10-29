-- 0042: evento de notificação 'ia_teto_proximo' (aviso aos sócios quando o gasto de IA do mês passa do percentual
-- de alerta). Fica em arquivo próprio: o valor novo do enum não pode ser usado na mesma transação que o criou
-- (regra 8 de docs/regras/agentes.md). Quem usa o valor é a rotina alertas-ia (migration 0043) e o código.

alter type public.evento_notificacao add value if not exists 'ia_teto_proximo';
