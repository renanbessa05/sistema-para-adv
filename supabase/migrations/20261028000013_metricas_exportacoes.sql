-- 0013: métricas diárias (view materializada) e registro de exportações
-- Depende de publicacoes (0006), prazos (0007), tarefas (0008), mensagens (0011), ia_execucoes e aprovacoes (0009).
-- "dia" é a data civil no fuso do escritório. Acerto da IA: data = data confirmada igual à sugerida; tipo = classificação da IA mantida (a confirmar com a tela de tratamento).

-- Criação guardada para a migration ser reaplicável; mudar a definição exige nova migration (drop + create).
do $$
begin
  if to_regclass('public.metricas_diarias') is not null then
    return;
  end if;
  execute $mv$
create materialized view public.metricas_diarias as
with fonte as (
  -- Publicações captadas (por data de entrada)
  select p.escritorio_id, (p.criado_em at time zone e.timezone)::date as dia,
         count(*)::int as publicacoes_captadas, 0 as publicacoes_tratadas,
         0 as prazos_sugeridos, 0 as prazos_confirmados, 0 as prazos_com_sugestao, 0 as prazos_acerto_data,
         0 as publicacoes_classificadas_ia, 0 as publicacoes_acerto_tipo,
         0 as tarefas_criadas, 0 as tarefas_concluidas, 0 as mensagens_whatsapp_enviadas,
         0::numeric as custo_ia_total, 0 as aprovacoes_decididas, 0::numeric as tempo_revisao_total_s
    from public.publicacoes p join public.escritorios e on e.id = p.escritorio_id
   group by 1, 2
  union all
  -- Publicações tratadas (por data do tratamento) e acerto de tipo da IA entre as tratadas
  select p.escritorio_id, (p.tratada_em at time zone e.timezone)::date,
         0, count(*)::int,
         0, 0, 0, 0,
         count(*) filter (where p.tipo_classificado_por is not null)::int,
         count(*) filter (where p.tipo_classificado_por = 'ia')::int,
         0, 0, 0,
         0::numeric, 0, 0::numeric
    from public.publicacoes p join public.escritorios e on e.id = p.escritorio_id
   where p.tratada_em is not null
   group by 1, 2
  union all
  -- Prazos sugeridos (por data de criação)
  select z.escritorio_id, (z.criado_em at time zone e.timezone)::date,
         0, 0,
         count(*)::int, 0, 0, 0,
         0, 0,
         0, 0, 0,
         0::numeric, 0, 0::numeric
    from public.prazos z join public.escritorios e on e.id = z.escritorio_id
   group by 1, 2
  union all
  -- Prazos confirmados (por data da confirmação) e acerto de data da IA
  select z.escritorio_id, (z.confirmado_em at time zone e.timezone)::date,
         0, 0,
         0, count(*)::int,
         count(*) filter (where z.data_sugerida_ia is not null)::int,
         count(*) filter (where z.data_sugerida_ia is not null and z.data_confirmada = z.data_sugerida_ia)::int,
         0, 0,
         0, 0, 0,
         0::numeric, 0, 0::numeric
    from public.prazos z join public.escritorios e on e.id = z.escritorio_id
   where z.confirmado_em is not null
   group by 1, 2
  union all
  -- Tarefas criadas
  select t.escritorio_id, (t.criado_em at time zone e.timezone)::date,
         0, 0, 0, 0, 0, 0, 0, 0,
         count(*)::int, 0, 0,
         0::numeric, 0, 0::numeric
    from public.tarefas t join public.escritorios e on e.id = t.escritorio_id
   group by 1, 2
  union all
  -- Tarefas concluídas
  select t.escritorio_id, (t.concluida_em at time zone e.timezone)::date,
         0, 0, 0, 0, 0, 0, 0, 0,
         0, count(*)::int, 0,
         0::numeric, 0, 0::numeric
    from public.tarefas t join public.escritorios e on e.id = t.escritorio_id
   where t.concluida_em is not null
   group by 1, 2
  union all
  -- Mensagens de WhatsApp enviadas
  select m.escritorio_id, (m.criado_em at time zone e.timezone)::date,
         0, 0, 0, 0, 0, 0, 0, 0,
         0, 0, count(*)::int,
         0::numeric, 0, 0::numeric
    from public.mensagens m
    join public.conversas c on c.id = m.conversa_id
    join public.escritorios e on e.id = m.escritorio_id
   where m.direcao = 'saida' and c.canal = 'whatsapp'
   group by 1, 2
  union all
  -- Custo de IA
  select x.escritorio_id, (x.criado_em at time zone e.timezone)::date,
         0, 0, 0, 0, 0, 0, 0, 0,
         0, 0, 0,
         coalesce(sum(x.custo_estimado), 0)::numeric, 0, 0::numeric
    from public.ia_execucoes x join public.escritorios e on e.id = x.escritorio_id
   group by 1, 2
  union all
  -- Tempo de revisão humana das aprovações decididas
  select a.escritorio_id, (a.decidida_em at time zone e.timezone)::date,
         0, 0, 0, 0, 0, 0, 0, 0,
         0, 0, 0,
         0::numeric, count(*)::int, coalesce(sum(a.tempo_revisao_humana_s), 0)::numeric
    from public.aprovacoes a join public.escritorios e on e.id = a.escritorio_id
   where a.decidida_em is not null
   group by 1, 2
)
select escritorio_id,
       dia,
       sum(publicacoes_captadas)::int as publicacoes_captadas,
       sum(publicacoes_tratadas)::int as publicacoes_tratadas,
       sum(prazos_sugeridos)::int as prazos_sugeridos,
       sum(prazos_confirmados)::int as prazos_confirmados,
       round(sum(prazos_acerto_data)::numeric / nullif(sum(prazos_com_sugestao), 0), 4) as acerto_data_ia,
       round(sum(publicacoes_acerto_tipo)::numeric / nullif(sum(publicacoes_classificadas_ia), 0), 4) as acerto_tipo_ia,
       sum(tarefas_criadas)::int as tarefas_criadas,
       sum(tarefas_concluidas)::int as tarefas_concluidas,
       sum(mensagens_whatsapp_enviadas)::int as mensagens_whatsapp_enviadas,
       round(sum(custo_ia_total), 6) as custo_ia_total,
       round(sum(tempo_revisao_total_s) / nullif(sum(aprovacoes_decididas), 0), 2) as tempo_revisao_medio_s
  from fonte
 where dia is not null
 group by escritorio_id, dia
with data
  $mv$;
end
$$;

-- Índice único exigido pelo refresh concurrently
create unique index if not exists metricas_diarias_escritorio_dia_unq on public.metricas_diarias (escritorio_id, dia);

-- Refresh pelo job atualizar-metricas (service role)
create or replace function public.atualizar_metricas_diarias()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently public.metricas_diarias;
end
$$;

-- Views materializadas não têm RLS: a leitura é por esta função, que filtra pelo escritório do JWT e exige sócio
create or replace function public.metricas_do_escritorio(p_de date default null, p_ate date default null)
returns setof public.metricas_diarias
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.eh_socio() then
    raise exception 'Apenas sócio pode ver as métricas' using errcode = '42501';
  end if;
  return query
    select m.*
      from public.metricas_diarias m
     where m.escritorio_id = app.escritorio_atual()
       and (p_de is null or m.dia >= p_de)
       and (p_ate is null or m.dia <= p_ate)
     order by m.dia desc;
end
$$;

-- Exportações geradas (CSV diário de prazos etc.) no bucket privado "exportacoes"
create table if not exists public.exportacoes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  tipo text not null,
  caminho_storage text not null,
  linhas int not null default 0 check (linhas >= 0),
  gerada_em timestamptz not null default now()
);
create index if not exists exportacoes_escritorio_tipo_idx on public.exportacoes (escritorio_id, tipo, gerada_em desc);

alter table public.exportacoes enable row level security;
drop policy if exists exportacoes_select_socio on public.exportacoes;
create policy exportacoes_select_socio on public.exportacoes for select to authenticated using (escritorio_id = app.escritorio_atual() and app.eh_socio());

-- Grants: a view só pela função; exportações só leitura para sócio; escrita pela service role
revoke all on public.metricas_diarias from public, anon, authenticated;
grant select on public.metricas_diarias to service_role;
revoke all on public.exportacoes from anon, authenticated;
grant select on public.exportacoes to authenticated;
grant all on public.exportacoes to service_role;

revoke execute on function public.atualizar_metricas_diarias() from public, anon, authenticated;
grant execute on function public.atualizar_metricas_diarias() to service_role;
grant execute on function public.metricas_do_escritorio(date, date) to authenticated, service_role;
revoke execute on function public.metricas_do_escritorio(date, date) from anon, public;
