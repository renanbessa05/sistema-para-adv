-- 0030: evento de parcela vencida e rotina de cobrança (Fase 2, lote 3; P3 do escopo)
-- O valor novo do enum só pode ser usado por código/migrations seguintes (regra 8 de docs/regras/agentes.md).

alter type public.evento_notificacao add value if not exists 'parcela_vencida';

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron indisponível: rotina cobranca-parcelas não agendada neste banco';
    return;
  end if;
  perform cron.schedule('rotina:cobranca-parcelas', '0 11 * * 1-5', format('select app.chamar_rotina(%L)', 'cobranca-parcelas'));
end
$$;
