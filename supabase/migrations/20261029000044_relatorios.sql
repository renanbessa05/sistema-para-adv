-- 0044: relatórios de produtividade (Fase 3, lote 11; P4 do escopo)
--
-- 1. metricas_mensais_usuario: view materializada com a produtividade de cada usuário por mês (mês civil no fuso do
--    escritório). Uma linha por (escritório, usuário, mês, sigiloso). "sigiloso" = processo em segredo de justiça.
--    Materialized view não tem RLS: a leitura é só pela RPC metricas_usuarios_do_escritorio, que filtra pelo escritório
--    do JWT e some com as linhas sigilosas para quem não é sócio. Sem grant para anon/authenticated.
-- 2. atualizar_metricas_diarias() passa a renovar as duas views (a rotina atualizar-metricas das 3h UTC já a chama).
-- 3. relatorios_agendados: um agendamento por escritório e tipo; só sócio lê e altera.
-- 4. Storage: o CSV agendado (prefixo relatorio-produtividade-) fica no bucket exportacoes, legível só pelo sócio.
--    Policy restritiva, porque a policy de leitura do bucket vale para todo o escritório.
-- 5. Rotina relatorio-mensal todo dia 1 às 11h UTC (07h em Cuiabá), no padrão de 0023 e 0043.
--
-- Leitura de métricas de usuário: sócio e advogado (estagiário e administrativo não). Processos em segredo de justiça:
-- só sócio; o job gera o CSV com a visão de sócio. Ver docs/regras/relatorios.md.

create materialized view if not exists public.metricas_mensais_usuario as
with fonte as (
  -- Tarefas concluídas pela pessoa (concluida_por), no mês da conclusão
  select t.escritorio_id, t.concluida_por as usuario_id,
         (date_trunc('month', t.concluida_em at time zone e.timezone))::date as mes,
         coalesce(pr.segredo_justica, false) as sigiloso,
         count(*)::int as tarefas_concluidas, 0 as prazos_confirmados, 0 as prazos_cumpridos, 0 as prazos_vencidos,
         0 as publicacoes_tratadas, 0 as aprovacoes_decididas, 0::numeric as tempo_revisao_total_s
    from public.tarefas t
    join public.escritorios e on e.id = t.escritorio_id
    left join public.processos pr on pr.id = t.processo_id
   where t.concluida_em is not null and t.concluida_por is not null
   group by 1, 2, 3, 4
  union all
  -- Prazos confirmados pela pessoa (confirmado_por), no mês da confirmação
  select z.escritorio_id, z.confirmado_por,
         (date_trunc('month', z.confirmado_em at time zone e.timezone))::date,
         coalesce(pr.segredo_justica, false),
         0, count(*)::int, 0, 0, 0, 0, 0::numeric
    from public.prazos z
    join public.escritorios e on e.id = z.escritorio_id
    left join public.processos pr on pr.id = z.processo_id
   where z.confirmado_em is not null and z.confirmado_por is not null
   group by 1, 2, 3, 4
  union all
  -- Prazos cumpridos pela pessoa (cumprido_por), no mês do cumprimento
  select z.escritorio_id, z.cumprido_por,
         (date_trunc('month', z.cumprido_em at time zone e.timezone))::date,
         coalesce(pr.segredo_justica, false),
         0, 0, count(*)::int, 0, 0, 0, 0::numeric
    from public.prazos z
    join public.escritorios e on e.id = z.escritorio_id
    left join public.processos pr on pr.id = z.processo_id
   where z.cumprido_em is not null and z.cumprido_por is not null
   group by 1, 2, 3, 4
  union all
  -- Prazos vencidos do responsável (responsavel_id), no mês do vencimento (data_final é date civil)
  select z.escritorio_id, z.responsavel_id,
         (date_trunc('month', z.data_final))::date,
         coalesce(pr.segredo_justica, false),
         0, 0, 0, count(*)::int, 0, 0, 0::numeric
    from public.prazos z
    left join public.processos pr on pr.id = z.processo_id
   where z.status = 'vencido' and z.responsavel_id is not null
   group by 1, 2, 3, 4
  union all
  -- Publicações tratadas pela pessoa (tratada_por), no mês do tratamento
  select p.escritorio_id, p.tratada_por,
         (date_trunc('month', p.tratada_em at time zone e.timezone))::date,
         coalesce(pr.segredo_justica, false),
         0, 0, 0, 0, count(*)::int, 0, 0::numeric
    from public.publicacoes p
    join public.escritorios e on e.id = p.escritorio_id
    left join public.processos pr on pr.id = p.processo_id
   where p.tratada_em is not null and p.tratada_por is not null
   group by 1, 2, 3, 4
  union all
  -- Aprovações decididas pelo aprovador (aprovador_id), com o tempo de revisão humana somado
  select a.escritorio_id, a.aprovador_id,
         (date_trunc('month', a.decidida_em at time zone e.timezone))::date,
         false,
         0, 0, 0, 0, 0, count(*)::int, coalesce(sum(a.tempo_revisao_humana_s), 0)::numeric
    from public.aprovacoes a
    join public.escritorios e on e.id = a.escritorio_id
   where a.decidida_em is not null and a.aprovador_id is not null
   group by 1, 2, 3, 4
)
select escritorio_id,
       usuario_id,
       mes,
       sigiloso,
       sum(tarefas_concluidas)::int as tarefas_concluidas,
       sum(prazos_confirmados)::int as prazos_confirmados,
       sum(prazos_cumpridos)::int as prazos_cumpridos,
       sum(prazos_vencidos)::int as prazos_vencidos,
       sum(publicacoes_tratadas)::int as publicacoes_tratadas,
       sum(aprovacoes_decididas)::int as aprovacoes_decididas,
       sum(tempo_revisao_total_s)::numeric as tempo_revisao_total_s
  from fonte
 where mes is not null and usuario_id is not null
 group by escritorio_id, usuario_id, mes, sigiloso
with data;

create unique index if not exists metricas_mensais_usuario_unq on public.metricas_mensais_usuario (escritorio_id, usuario_id, mes, sigiloso);
revoke all on public.metricas_mensais_usuario from public, anon, authenticated;

-- Renova as duas views (a rotina atualizar-metricas chama esta função às 3h UTC)
create or replace function public.atualizar_metricas_diarias()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently public.metricas_diarias;
  refresh materialized view concurrently public.metricas_mensais_usuario;
end
$$;

-- Produtividade por usuário, lida pela RPC. Visões:
--   * usuário logado: só sócio e advogado, com segundo fator; escritório = o do JWT; sigilosos só para sócio.
--   * service role (job relatorio-mensal): informa p_escritorio_id; vê tudo do escritório.
-- Taxa de cumprimento e tempo médio ficam em src/lib/relatorios (puro), não aqui.
create or replace function public.metricas_usuarios_do_escritorio(p_de date default null, p_ate date default null, p_escritorio_id uuid default null)
returns table (
  usuario_id uuid,
  nome_completo text,
  competencia date,
  tarefas_concluidas bigint,
  prazos_confirmados bigint,
  prazos_cumpridos bigint,
  prazos_vencidos bigint,
  publicacoes_tratadas bigint,
  aprovacoes_decididas bigint,
  tempo_revisao_total_s numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_escritorio uuid;
  v_servico boolean := app.eh_service_role();
  v_socio boolean;
begin
  if v_servico then
    v_escritorio := p_escritorio_id;
    if v_escritorio is null then
      raise exception 'Informe o escritório' using errcode = '22004';
    end if;
    v_socio := true;
  else
    if not app.mfa_satisfeita() then
      raise exception 'Segundo fator obrigatório' using errcode = '42501';
    end if;
    if not app.eh_advogado_ou_socio() then
      raise exception 'Apenas sócio ou advogado vê métricas de usuários' using errcode = '42501';
    end if;
    if p_escritorio_id is not null and p_escritorio_id <> app.escritorio_atual() then
      raise exception 'Escritório diferente do seu' using errcode = '42501';
    end if;
    v_escritorio := app.escritorio_atual();
    v_socio := app.eh_socio();
  end if;

  return query
    select m.usuario_id,
           coalesce(mb.nome_completo, '(sem nome)')::text,
           m.mes,
           sum(m.tarefas_concluidas)::bigint,
           sum(m.prazos_confirmados)::bigint,
           sum(m.prazos_cumpridos)::bigint,
           sum(m.prazos_vencidos)::bigint,
           sum(m.publicacoes_tratadas)::bigint,
           sum(m.aprovacoes_decididas)::bigint,
           sum(m.tempo_revisao_total_s)::numeric
      from public.metricas_mensais_usuario m
      left join public.escritorio_membros mb on mb.escritorio_id = m.escritorio_id and mb.usuario_id = m.usuario_id
     where m.escritorio_id = v_escritorio
       and (not m.sigiloso or v_socio)
       and (p_de is null or m.mes >= p_de)
       and (p_ate is null or m.mes <= p_ate)
     group by m.usuario_id, mb.nome_completo, m.mes
     order by m.mes desc, mb.nome_completo;
end
$$;
revoke execute on function public.metricas_usuarios_do_escritorio(date, date, uuid) from public, anon;
grant execute on function public.metricas_usuarios_do_escritorio(date, date, uuid) to authenticated, service_role;

-- Agendamento por escritório (só sócio). ultima_competencia evita gerar o mesmo mês duas vezes.
create table if not exists public.relatorios_agendados (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  tipo text not null check (tipo in ('produtividade_mensal')),
  ativo boolean not null default false,
  ultima_competencia date,
  ultima_geracao_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (escritorio_id, tipo)
);
drop trigger if exists relatorios_agendados_atualizado_em on public.relatorios_agendados;
create trigger relatorios_agendados_atualizado_em before update on public.relatorios_agendados for each row execute function app.set_atualizado_em();

alter table public.relatorios_agendados enable row level security;
drop policy if exists tenant_isolamento on public.relatorios_agendados;
create policy tenant_isolamento on public.relatorios_agendados for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
drop policy if exists relatorios_so_socio on public.relatorios_agendados;
create policy relatorios_so_socio on public.relatorios_agendados as restrictive for all to authenticated using (app.eh_socio()) with check (app.eh_socio());

do $$
declare
  t text;
begin
  foreach t in array array['relatorios_agendados'] loop
    execute format('drop policy if exists mfa_obrigatorio on public.%I', t);
    execute format('create policy mfa_obrigatorio on public.%I as restrictive for all to authenticated using (app.mfa_satisfeita()) with check (app.mfa_satisfeita())', t);
  end loop;
end
$$;
grant select, insert, update on public.relatorios_agendados to authenticated;
grant all on public.relatorios_agendados to service_role;

-- CSV de produtividade no bucket exportacoes: a policy de leitura do bucket vale para o escritório inteiro,
-- então esta restritiva limita os arquivos de relatório ao sócio.
do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'schema storage ausente: policy de relatórios não criada neste banco';
    return;
  end if;
  execute 'drop policy if exists relatorios_so_socio on storage.objects';
  execute $p$
    create policy relatorios_so_socio on storage.objects as restrictive for select to authenticated
      using (bucket_id <> 'exportacoes' or name not like '%/relatorio-produtividade-%' or app.eh_socio())
  $p$;
end
$$;

-- Rotina mensal (pg_cron + app.chamar_rotina, como 0023/0030/0043). Dia 1, 11h UTC = 07h em Cuiabá.
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron indisponível: rotina relatorio-mensal não agendada neste banco';
    return;
  end if;
  perform cron.schedule('rotina:relatorio-mensal', '0 11 1 * *', format('select app.chamar_rotina(%L)', 'relatorio-mensal'));
end
$$;
