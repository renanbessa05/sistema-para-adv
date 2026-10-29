-- 0043: rotina alertas-ia (Fase 3, lote 10). Todo dia às 12h UTC (08h em Cuiabá) confere o gasto de IA do mês de
-- cada escritório e enfileira 'ia_teto_proximo' para os sócios quando passa de 'ia.alerta_percentual' (padrão 80%).
-- Mesmo padrão de 0023 e 0030: a rotina é chamada por app.chamar_rotina; sem credenciais no Vault, pula com NOTICE.

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron indisponível: rotina alertas-ia não agendada neste banco';
    return;
  end if;
  perform cron.schedule('rotina:alertas-ia', '0 12 * * *', format('select app.chamar_rotina(%L)', 'alertas-ia'));
end
$$;
