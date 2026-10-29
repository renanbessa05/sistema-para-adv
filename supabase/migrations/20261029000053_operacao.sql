-- 0053: operação de produto (Fase 2, lote 15; P6 do escopo)
--
-- 1. incidentes: registro operacional por escritório (sem dados de processo, cliente ou documento no texto).
--    Escrita só pela service role (operador/suporte via runbook docs/runbooks/incidente.md).
-- 2. backups_tenant: um registro por snapshot diário gerado pelo job backup-tenant. O arquivo fica no bucket
--    privado `exportacoes`, em backups/<escritorio>/, e nunca sai do Supabase. Só sócio e suporte leem a lista.
-- 3. Rotinas no pg_cron (mesmo mecanismo da 0023): backup-tenant às 06 UTC (02h em Cuiabá) e verificar-backup
--    às segundas, 07 UTC.
--
-- Segundo fator: laço da 0016 aplicado às tabelas novas (policy restritiva com app.mfa_satisfeita()).

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Incidentes
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.incidentes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios (id) on delete cascade,
  titulo text not null check (char_length(btrim(titulo)) between 3 and 200),
  -- Descrição técnica: não colar trechos de processo, nomes de clientes ou conteúdo de documentos.
  descricao text check (descricao is null or char_length(descricao) <= 4000),
  severidade text not null default 'baixa' check (severidade in ('baixa', 'media', 'alta', 'critica')),
  status text not null default 'aberto' check (status in ('aberto', 'em_analise', 'resolvido')),
  aberto_em timestamptz not null default now(),
  resolvido_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint incidentes_resolucao_coerente check ((status = 'resolvido') = (resolvido_em is not null))
);
create index if not exists incidentes_escritorio_idx on public.incidentes (escritorio_id, aberto_em desc);

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Backups por tenant
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.backups_tenant (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios (id) on delete cascade,
  gerado_em timestamptz not null default now(),
  caminho_storage text not null check (caminho_storage like 'backups/%'),
  tamanho_bytes bigint not null default 0 check (tamanho_bytes >= 0),
  -- contagem de linhas por tabela, ex.: {"processos": 120, "prazos": 340}
  contagens jsonb not null default '{}'::jsonb,
  status text not null default 'ok' check (status in ('ok', 'erro')),
  erro text,
  criado_em timestamptz not null default now()
);
create index if not exists backups_tenant_escritorio_idx on public.backups_tenant (escritorio_id, gerado_em desc);

-- ---------------------------------------------------------------------------------------------------------------
-- RLS e grants
-- ---------------------------------------------------------------------------------------------------------------
alter table public.incidentes enable row level security;
alter table public.backups_tenant enable row level security;

-- Leitura: só sócio ou suporte com acesso vigente, e só do escritório atual. Sem policy de escrita para usuários.
drop policy if exists incidentes_leitura_gestao on public.incidentes;
create policy incidentes_leitura_gestao on public.incidentes for select to authenticated
  using (escritorio_id = app.escritorio_atual() and (app.eh_socio() or app.eh_suporte()));

drop policy if exists backups_tenant_leitura_gestao on public.backups_tenant;
create policy backups_tenant_leitura_gestao on public.backups_tenant for select to authenticated
  using (escritorio_id = app.escritorio_atual() and (app.eh_socio() or app.eh_suporte()));

revoke all on public.incidentes from anon, authenticated;
revoke all on public.backups_tenant from anon, authenticated;
grant select on public.incidentes to authenticated;
grant select on public.backups_tenant to authenticated;
grant all on public.incidentes to service_role;
grant all on public.backups_tenant to service_role;

-- Laço de MFA (mesma regra da 0016 e da 0045): sessão de sócio ou advogado precisa de aal2 para ver estas tabelas.
do $$
declare
  t text;
begin
  foreach t in array array['incidentes', 'backups_tenant'] loop
    execute format('drop policy if exists mfa_obrigatorio on public.%I', t);
    execute format(
      'create policy mfa_obrigatorio on public.%I as restrictive for all to authenticated using (app.mfa_satisfeita()) with check (app.mfa_satisfeita())',
      t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Rotinas de backup (mesmo padrão de 0023 e 0030: horários em UTC; reagendar com o mesmo nome substitui)
-- ---------------------------------------------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron indisponível: rotinas backup-tenant e verificar-backup não agendadas neste banco';
    return;
  end if;
  perform cron.schedule('rotina:backup-tenant', '0 6 * * *', format('select app.chamar_rotina(%L)', 'backup-tenant'));
  perform cron.schedule('rotina:verificar-backup', '0 7 * * 1', format('select app.chamar_rotina(%L)', 'verificar-backup'));
end
$$;
