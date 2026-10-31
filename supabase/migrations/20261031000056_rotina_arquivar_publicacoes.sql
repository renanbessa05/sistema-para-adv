-- 0056: rotina arquivar-publicacoes. Dias úteis às 05h UTC (01h em Cuiabá): publicações em estado final
-- (tratada, ignorada, duplicada) há mais de 30 dias passam a 'arquivada' pela RPC transicionar_publicacao, com
-- evento em publicacao_eventos (docs/regras/estados.md, "após 30 dias, para limpar a caixa").
-- Mesmo padrão de 0023 e 0043: a rotina é chamada por app.chamar_rotina; sem credenciais no Vault, pula com NOTICE.

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron indisponível: rotina arquivar-publicacoes não agendada neste banco';
    return;
  end if;
  perform cron.schedule('rotina:arquivar-publicacoes', '0 5 * * 1-5', format('select app.chamar_rotina(%L)', 'arquivar-publicacoes'));
end
$$;
