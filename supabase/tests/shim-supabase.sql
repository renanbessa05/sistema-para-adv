-- Shim para rodar as migrations num Postgres comum (CI e testes locais sem Docker).
-- Reproduz o mínimo do Supabase: roles, schema auth com users, auth.uid(), auth.jwt() e auth.role().
-- Em produção nada disto é aplicado: o Supabase já tem tudo.

-- Roles são globais no cluster: vários bancos de teste em paralelo podem tentar criá-los ao mesmo tempo.
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'supabase_auth_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      begin
        if r = 'service_role' then
          execute 'create role service_role nologin bypassrls';
        else
          execute format('create role %I nologin', r);
        end if;
      exception when duplicate_object or unique_violation then
        null; -- outro processo criou primeiro
      end;
    end if;
  end loop;
end
$$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
grant all on auth.users to supabase_auth_admin, service_role;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

-- Fatores de MFA (o Supabase Auth mantém esta tabela; aqui só o que as policies de aal2 consultam)
create table if not exists auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  friendly_name text,
  factor_type text not null default 'totp',
  status text not null default 'unverified',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
grant select on auth.mfa_factors to authenticated, service_role, supabase_auth_admin;
grant all on auth.mfa_factors to service_role, supabase_auth_admin;

-- Vault emulado (sem criptografia): mesma interface de vault.create_secret / update_secret / decrypted_secrets
create schema if not exists vault;
create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  description text not null default '',
  secret text not null,
  key_id uuid,
  nonce bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace view vault.decrypted_secrets as
  select id, name, description, secret, secret as decrypted_secret, key_id, nonce, created_at, updated_at from vault.secrets;
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
returns uuid language sql as $$
  insert into vault.secrets (secret, name, description, key_id) values (new_secret, new_name, coalesce(new_description, ''), new_key_id) returning id
$$;
create or replace function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null)
returns void language sql as $$
  update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name), description = coalesce(new_description, description), key_id = coalesce(new_key_id, key_id), updated_at = now() where id = secret_id
$$;
grant usage on schema vault to service_role;
grant all on vault.secrets to service_role;
grant select on vault.decrypted_secrets to service_role;

grant usage on schema public to anon, authenticated, service_role, supabase_auth_admin;
grant all on schema public to service_role;

-- Mesmo search_path do Supabase para esta sessão (índices com gin_trgm_ops e funções não qualificadas)
create schema if not exists extensions;
select set_config('search_path', 'public, extensions', false);
