-- 0001: schemas, extensões e funções auxiliares
-- Convenções: ref = dados globais; app = funções auxiliares (não exposto pela API); public = tabelas de tenant.

create schema if not exists ref;
create schema if not exists app;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- pgmq (filas) existe no Supabase; em Postgres comum (CI local) é ignorado e a fila própria é usada.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pgmq') then
    execute 'create extension if not exists pgmq';
  end if;
end
$$;

grant usage on schema ref to anon, authenticated, service_role;
grant usage on schema app to authenticated, service_role;

-- Papéis dentro do escritório
do $$
begin
  if not exists (select 1 from pg_type where typname = 'papel') then
    create type public.papel as enum ('socio', 'advogado', 'estagiario', 'administrativo');
  end if;
end
$$;

-- Escritório e papel do usuário logado, lidos do JWT (gravados pelo Custom Access Token Hook).
-- Aceita tanto claims de topo quanto dentro de app_metadata. Nunca lê user_metadata.
create or replace function app.escritorio_atual()
returns uuid
language sql
stable
as $$
  select nullif(coalesce(auth.jwt() ->> 'escritorio_id', auth.jwt() -> 'app_metadata' ->> 'escritorio_id'), '')::uuid
$$;

create or replace function app.papel_atual()
returns text
language sql
stable
as $$
  select nullif(coalesce(auth.jwt() ->> 'papel', auth.jwt() -> 'app_metadata' ->> 'papel'), '')
$$;

create or replace function app.usuario_atual()
returns uuid
language sql
stable
as $$
  select auth.uid()
$$;

create or replace function app.eh_socio()
returns boolean
language sql
stable
as $$
  select app.papel_atual() = 'socio'
$$;

create or replace function app.eh_advogado_ou_socio()
returns boolean
language sql
stable
as $$
  select app.papel_atual() in ('socio', 'advogado')
$$;

-- Trigger genérico de atualizado_em
create or replace function app.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end
$$;

-- Número CNJ: validação do dígito verificador (módulo 97) e máscara
create or replace function app.cnj_digitos(texto text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(texto, ''), '\D', '', 'g')
$$;

create or replace function app.cnj_valido(texto text)
returns boolean
language plpgsql
immutable
as $$
declare
  d text := app.cnj_digitos(texto);
  base numeric;
  dv int;
begin
  if d !~ '^\d{20}$' then
    return false;
  end if;
  base := (substr(d, 1, 7) || substr(d, 10, 4) || substr(d, 14, 1) || substr(d, 15, 2) || substr(d, 17, 4) || '00')::numeric;
  dv := 98 - (base % 97)::int;
  return lpad(dv::text, 2, '0') = substr(d, 8, 2);
end
$$;

create or replace function app.cnj_mascara(texto text)
returns text
language sql
immutable
as $$
  select case
    when app.cnj_digitos(texto) ~ '^\d{20}$' then
      substr(app.cnj_digitos(texto), 1, 7) || '-' || substr(app.cnj_digitos(texto), 8, 2) || '.' ||
      substr(app.cnj_digitos(texto), 10, 4) || '.' || substr(app.cnj_digitos(texto), 14, 1) || '.' ||
      substr(app.cnj_digitos(texto), 15, 2) || '.' || substr(app.cnj_digitos(texto), 17, 4)
    else null
  end
$$;

-- Data civil "hoje" num fuso IANA
create or replace function app.hoje_no_fuso(tz text)
returns date
language sql
stable
as $$
  select (now() at time zone tz)::date
$$;

grant execute on all functions in schema app to authenticated, service_role;
alter default privileges in schema app grant execute on functions to authenticated, service_role;
