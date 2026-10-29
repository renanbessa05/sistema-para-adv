-- 0026: contexto das execuções de IA, gasto do mês por escritório e rotina de extração de texto (Fase 2, lote 1)
--
-- ia_execucoes ganha o que os agentes com ferramentas precisam registrar: esforço pedido, motivo de parada,
-- conversa de origem e quantas ferramentas foram chamadas. app.ia_gasto_mes centraliza a soma que o teto mensal
-- usa (antes era feita em código só no job de classificação). A fila `extracao_documentos` é drenada pela rotina
-- extrair-texto (a cada 5 min), que grava documento_paginas.

alter table public.ia_execucoes
  add column if not exists effort text,
  add column if not exists stop_reason text,
  add column if not exists conversa_id uuid,
  add column if not exists ferramentas_chamadas int not null default 0;
create index if not exists ia_execucoes_conversa_idx on public.ia_execucoes (conversa_id) where conversa_id is not null;

-- Gasto estimado em US$ do escritório no mês (UTC) da data informada
create or replace function app.ia_gasto_mes(p_escritorio uuid, p_data date default (now() at time zone 'UTC')::date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(e.custo_estimado), 0)
    from public.ia_execucoes e
   where e.escritorio_id = p_escritorio
     and e.criado_em >= date_trunc('month', p_data::timestamp) at time zone 'UTC'
     and e.criado_em <  (date_trunc('month', p_data::timestamp) + interval '1 month') at time zone 'UTC'
$$;
revoke execute on function app.ia_gasto_mes(uuid, date) from public, anon;
grant execute on function app.ia_gasto_mes(uuid, date) to authenticated, service_role;

-- Teto configurável por escritório (chave 'ia.teto_mensal_usd' em escritorio_configuracoes); null = usa o padrão do ambiente
create or replace function app.ia_teto_escritorio(p_escritorio uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when jsonb_typeof(c.valor) = 'number' then (c.valor)::numeric else null end
    from public.escritorio_configuracoes c
   where c.escritorio_id = p_escritorio and c.chave = 'ia.teto_mensal_usd'
$$;
revoke execute on function app.ia_teto_escritorio(uuid) from public, anon;
grant execute on function app.ia_teto_escritorio(uuid) to authenticated, service_role;

-- Rotina de extração de texto dos documentos enviados
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron indisponível: rotina extrair-texto não agendada neste banco';
    return;
  end if;
  perform cron.schedule('rotina:extrair-texto', '*/5 * * * *', format('select app.chamar_rotina(%L)', 'extrair-texto'));
end
$$;
