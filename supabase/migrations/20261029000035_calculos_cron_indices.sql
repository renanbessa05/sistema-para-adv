-- 0035: agenda a rotina importar-indices (séries do BCB para os cálculos de atualização, lote 6).
-- Segundas às 09:00 UTC (05:00 em Cuiabá). A rotina é idempotente: regrava só os meses publicados.

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron indisponível: rotina importar-indices não agendada neste banco';
    return;
  end if;
  perform cron.schedule('rotina:importar-indices', '0 9 * * 1', format('select app.chamar_rotina(%L)', 'importar-indices'));
end
$$;
