-- 0004: escritórios (tenants), membros, telefones, configurações e claims no JWT

create table if not exists public.escritorios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  razao_social text,
  cnpj text unique,
  timezone text not null default 'America/Cuiaba',
  dias_seguranca_padrao int not null default 2 check (dias_seguranca_padrao >= 0),
  horario_resumo time not null default '07:30',
  semana_inclui_proxima_segunda boolean not null default true,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
drop trigger if exists escritorios_atualizado_em on public.escritorios;
create trigger escritorios_atualizado_em before update on public.escritorios for each row execute function app.set_atualizado_em();

-- Vínculo usuário ↔ escritório (fonte da verdade para o claim do JWT)
create table if not exists public.escritorio_membros (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  usuario_id uuid references auth.users(id) on delete set null,
  email_convite text not null,
  papel public.papel not null,
  nome_completo text not null,
  oab_numero text,
  oab_uf char(2),
  oab_sufixo text,
  nomes_alternativos text[] not null default '{}',
  assinatura_padrao text,
  ativo boolean not null default true,
  convite_token text unique,
  convite_expira_em timestamptz,
  aceito_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (usuario_id, escritorio_id),
  unique (escritorio_id, email_convite)
);
create index if not exists escritorio_membros_usuario_idx on public.escritorio_membros (usuario_id) where ativo;
create index if not exists escritorio_membros_escritorio_idx on public.escritorio_membros (escritorio_id, ativo);
drop trigger if exists escritorio_membros_atualizado_em on public.escritorio_membros;
create trigger escritorio_membros_atualizado_em before update on public.escritorio_membros for each row execute function app.set_atualizado_em();

-- Telefones autorizados a falar com o sistema pelo WhatsApp (um telefone, um escritório)
create table if not exists public.usuario_telefones (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  telefone_e164 text not null unique check (telefone_e164 ~ '^\+[1-9]\d{7,14}$'),
  verificado_em timestamptz,
  codigo_verificacao_hash text,
  codigo_expira_em timestamptz,
  opt_in_em timestamptz,
  principal boolean not null default true,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists usuario_telefones_escritorio_idx on public.usuario_telefones (escritorio_id, ativo);
drop trigger if exists usuario_telefones_atualizado_em on public.usuario_telefones;
create trigger usuario_telefones_atualizado_em before update on public.usuario_telefones for each row execute function app.set_atualizado_em();

-- Configurações livres por escritório (chave → json)
create table if not exists public.escritorio_configuracoes (
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  chave text not null,
  valor jsonb not null,
  atualizado_por uuid,
  atualizado_em timestamptz not null default now(),
  primary key (escritorio_id, chave)
);

-- Custom Access Token Hook: grava escritorio_id e papel nos claims do JWT.
-- Ativar no painel do Supabase (Auth → Hooks) e em supabase/config.toml para o local.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
  membro record;
  app_meta jsonb;
begin
  claims := coalesce(event -> 'claims', '{}'::jsonb);
  select m.escritorio_id, m.papel
    into membro
    from public.escritorio_membros m
   where m.usuario_id = (event ->> 'user_id')::uuid
     and m.ativo
   order by m.aceito_em desc nulls last, m.criado_em
   limit 1;

  if membro.escritorio_id is not null then
    claims := jsonb_set(claims, '{escritorio_id}', to_jsonb(membro.escritorio_id::text), true);
    claims := jsonb_set(claims, '{papel}', to_jsonb(membro.papel::text), true);
    app_meta := coalesce(claims -> 'app_metadata', '{}'::jsonb)
      || jsonb_build_object('escritorio_id', membro.escritorio_id::text, 'papel', membro.papel::text);
    claims := jsonb_set(claims, '{app_metadata}', app_meta, true);
  end if;

  return jsonb_set(event, '{claims}', claims, true);
end
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on table public.escritorio_membros to supabase_auth_admin;

-- Ao criar o usuário no Auth, vincula o convite pendente pelo e-mail
create or replace function app.vincular_membro_por_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.escritorio_membros
     set usuario_id = new.id,
         aceito_em = coalesce(aceito_em, now()),
         convite_token = null
   where usuario_id is null
     and lower(email_convite) = lower(new.email);
  return new;
end
$$;
drop trigger if exists vincular_membro_por_email on auth.users;
create trigger vincular_membro_por_email after insert on auth.users for each row execute function app.vincular_membro_por_email();

-- RLS
alter table public.escritorios enable row level security;
alter table public.escritorio_membros enable row level security;
alter table public.usuario_telefones enable row level security;
alter table public.escritorio_configuracoes enable row level security;

drop policy if exists escritorios_select on public.escritorios;
create policy escritorios_select on public.escritorios for select to authenticated using (id = app.escritorio_atual());
drop policy if exists escritorios_update_socio on public.escritorios;
create policy escritorios_update_socio on public.escritorios for update to authenticated using (id = app.escritorio_atual() and app.eh_socio()) with check (id = app.escritorio_atual() and app.eh_socio());

drop policy if exists membros_select on public.escritorio_membros;
create policy membros_select on public.escritorio_membros for select to authenticated using (escritorio_id = app.escritorio_atual());
drop policy if exists membros_auth_admin on public.escritorio_membros;
create policy membros_auth_admin on public.escritorio_membros for select to supabase_auth_admin using (true);
drop policy if exists membros_escrita_socio on public.escritorio_membros;
create policy membros_escrita_socio on public.escritorio_membros for all to authenticated using (escritorio_id = app.escritorio_atual() and app.eh_socio()) with check (escritorio_id = app.escritorio_atual() and app.eh_socio());

drop policy if exists telefones_select on public.usuario_telefones;
create policy telefones_select on public.usuario_telefones for select to authenticated using (escritorio_id = app.escritorio_atual());
drop policy if exists telefones_proprio on public.usuario_telefones;
create policy telefones_proprio on public.usuario_telefones for all to authenticated
  using (escritorio_id = app.escritorio_atual() and (usuario_id = app.usuario_atual() or app.eh_socio()))
  with check (escritorio_id = app.escritorio_atual() and (usuario_id = app.usuario_atual() or app.eh_socio()));

drop policy if exists configuracoes_select on public.escritorio_configuracoes;
create policy configuracoes_select on public.escritorio_configuracoes for select to authenticated using (escritorio_id = app.escritorio_atual());
drop policy if exists configuracoes_escrita_socio on public.escritorio_configuracoes;
create policy configuracoes_escrita_socio on public.escritorio_configuracoes for all to authenticated using (escritorio_id = app.escritorio_atual() and app.eh_socio()) with check (escritorio_id = app.escritorio_atual() and app.eh_socio());

grant select, insert, update, delete on public.escritorios, public.escritorio_membros, public.usuario_telefones, public.escritorio_configuracoes to authenticated;
grant all on public.escritorios, public.escritorio_membros, public.usuario_telefones, public.escritorio_configuracoes to service_role;
